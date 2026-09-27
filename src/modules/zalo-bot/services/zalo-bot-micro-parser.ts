import { TransactionType } from '@prisma/client';
import {
  AmbiguousIntent,
  BotConversationContext,
  DeltaPatchAST,
  MutationAST,
  ParsedIntent,
  UndoIntent,
} from './zalo-bot-fast-entry.dto';

export interface EntityContext {
  categories: Array<{ id: string; name: string; type: TransactionType }>;
  wallets: Array<{ id: string; name: string; currency: string }>;
  defaultWalletId: string | null;
}

// ─── Từ khóa phân loại ý định ────────────────────────────────────────────────

const INCOME_KEYWORDS = [
  'nhận lương', 'lĩnh lương', 'thu lương', 'nhận thưởng', 'nhận tiền',
  'thu nhập', 'tiền thu', 'bán được', 'hoàn tiền', 'khách trả',
  'income', 'salary', 'bonus', 'receive', 'received',
  'lương', 'thưởng',
];

const EDIT_KEYWORDS = [
  'sửa', 'sua', 'đổi', 'doi', 'nhầm', 'nham', 'thay',
  'ghi chú là', 'thêm ghi chú', 'note',
];

const EDIT_AMOUNT_PATTERNS = [
  /(?:sửa\s+(?:thành|thanh|lại|lai)|đổi\s+(?:thành|sang)|thay\s+(?:bằng|bang))\s+(\d[\d.,]*)\s*(k|nghìn|ngàn|ng|tr|triệu|m|củ|vnd|đ|dong)?/i,
  /(?:nhầm|nham)\s+(?:là|la|thành|thanh)?\s*(\d[\d.,]*)\s*(k|nghìn|ngàn|ng|tr|triệu|m|củ|vnd|đ|dong)?/i,
  /^(?:thực\s+ra\s+là|chính\s+xác\s+là|đúng\s+là)\s+(\d[\d.,]*)\s*(k|nghìn|ngàn|ng|tr|triệu|m|củ|vnd|đ|dong)?/i,
];

const QUOTE_REPLY_BARE_AMOUNT_PATTERN =
  /^(\d[\d.,]*)\s*(k|nghìn|ngàn|ng|tr|triệu|m|củ|vnd|đ|dong)?$/i;

const EDIT_WALLET_PATTERNS = [
  /(?:đổi\s+(?:sang|ví|vi)?\s*|chuyển\s+(?:sang|ví|vi)?\s*|trả\s+bằng\s+|dùng\s+ví\s+)(.+)/i,
];

const EDIT_CATEGORY_PATTERNS = [
  /(?:không phải|khong phai)\s+(.+?)(?:\s+mà là|\s+nhé|$)/i,
  /(?:đổi\s+danh mục\s+(?:sang|thành)\s+)(.+)/i,
  /(?:chuyển\s+sang\s+mục\s+)(.+)/i,
];

const EDIT_DESCRIPTION_PATTERNS = [
  /(?:thêm\s+ghi\s+chú\s+)(.+)/i,
  /(?:ghi\s+chú\s+là\s+|note\s+)(.+)/i,
];

// ─── Hằng số đơn vị tiền ──────────────────────────────────────────────────────

const AMOUNT_REGEX =
  /(\d[\d.,]*)(?:\s*)(k|nghìn|ngàn|ng|tr|triệu|m|củ|vnd|đ|dong)?(?=\s|$|[^0-9])/gi;

const UNIT_MULTIPLIERS: Record<string, number> = {
  k: 1_000,
  nghìn: 1_000,
  ngàn: 1_000,
  ng: 1_000,
  tr: 1_000_000,
  triệu: 1_000_000,
  m: 1_000_000,
  củ: 1_000_000,
  vnd: 1,
  đ: 1,
  dong: 1,
};

// ─── Parser helpers ───────────────────────────────────────────────────────────

function normalizeText(text: string): string {
  return text.toLowerCase().trim();
}

/**
 * Phân tích số tiền từ chuỗi số và đơn vị.
 * Xử lý chính xác dấu phân cách hàng nghìn kiểu Việt Nam (ví dụ 35.000đ, 1.500.000đ)
 * và số thập phân với đơn vị lớn (ví dụ 35.5k, 1.5tr).
 */
export function parseAmount(raw: string, unit?: string): number {
  const clean = raw.trim();
  const normalizedUnit = unit ? unit.toLowerCase().trim() : '';
  const multiplier = normalizedUnit ? (UNIT_MULTIPLIERS[normalizedUnit] ?? 1) : 1;

  // Trường hợp 1: Có nhiều dấu chấm hoặc dấu phẩy phân cách hàng nghìn (ví dụ 1.500.000 hoặc 1,500,000)
  const dotCount = (clean.match(/\./g) || []).length;
  const commaCount = (clean.match(/,/g) || []).length;

  if (dotCount > 1 || commaCount > 1) {
    const digitsOnly = clean.replace(/[.,]/g, '');
    const num = parseFloat(digitsOnly);
    if (isNaN(num)) return 0;
    return Math.round(num * multiplier);
  }

  // Trường hợp 2: Có đúng 1 dấu phân cách
  if (dotCount === 1 || commaCount === 1) {
    const sep = dotCount === 1 ? '.' : ',';
    const [intPart, decPart] = clean.split(sep);

    // Phân cách hàng nghìn khi phần sau có đúng 3 chữ số và không dùng đơn vị k, tr, m...
    const isThousandSep =
      decPart.length === 3 &&
      (!normalizedUnit || normalizedUnit === 'đ' || normalizedUnit === 'vnd' || normalizedUnit === 'dong');

    if (isThousandSep) {
      const num = parseFloat(intPart + decPart);
      if (isNaN(num)) return 0;
      return Math.round(num * multiplier);
    }

    // Số thập phân (VD 35.5k, 1.5tr)
    const num = parseFloat(`${intPart}.${decPart}`);
    if (isNaN(num)) return 0;
    return Math.round(num * multiplier);
  }

  // Trường hợp 3: Số nguyên thông thường (VD 35000, 50k, 20tr)
  const num = parseFloat(clean);
  if (isNaN(num)) return 0;
  return Math.round(num * multiplier);
}

function extractAmount(lower: string): { amount: number; remaining: string } {
  let best = 0;
  let bestMatch: RegExpMatchArray | null = null;

  const globalRegex = new RegExp(AMOUNT_REGEX.source, 'gi');
  let match: RegExpMatchArray | null;

  while ((match = globalRegex.exec(lower)) !== null) {
    const amt = parseAmount(match[1], match[2]);
    if (amt > best) {
      best = amt;
      bestMatch = match;
    }
  }

  if (!bestMatch || best === 0) {
    return { amount: 0, remaining: lower };
  }

  const remaining = (lower.slice(0, bestMatch.index) + lower.slice(bestMatch.index! + bestMatch[0].length))
    .replace(/\s+/g, ' ')
    .trim();

  return { amount: best, remaining };
}

function extractTransactionType(lower: string): TransactionType {
  if (INCOME_KEYWORDS.some((k) => lower.includes(k))) return TransactionType.INCOME;
  return TransactionType.EXPENSE;
}

function extractWallet(
  text: string,
  wallets: EntityContext['wallets'],
  defaultWalletId: string | null,
): { walletId: string; walletName: string; remaining: string } | null {
  const lower = normalizeText(text);

  // Sắp xếp theo độ dài tên giảm dần để khớp tên dài trước
  const sorted = [...wallets].sort((a, b) => b.name.length - a.name.length);

  for (const w of sorted) {
    const wLower = normalizeText(w.name);
    const patterns = [
      `ví ${wLower}`,
      `vi ${wLower}`,
      `tài khoản ${wLower}`,
      `tai khoan ${wLower}`,
      wLower,
    ];
    for (const p of patterns) {
      const idx = lower.indexOf(p);
      if (idx !== -1) {
        const remaining = (text.slice(0, idx) + text.slice(idx + p.length))
          .replace(/\s+/g, ' ')
          .trim();
        return { walletId: w.id, walletName: w.name, remaining };
      }
    }
  }

  // Fallback về ví mặc định
  if (defaultWalletId) {
    const defaultWallet = wallets.find((w) => w.id === defaultWalletId);
    if (defaultWallet) {
      return { walletId: defaultWallet.id, walletName: defaultWallet.name, remaining: text };
    }
  }

  return null;
}

function extractCategory(
  text: string,
  type: TransactionType,
  categories: EntityContext['categories'],
): { categoryId: string; categoryName: string; remaining: string } | null {
  const lower = normalizeText(text);

  const compatible = categories.filter(
    (c) => c.type === type || c.type === TransactionType.EXPENSE,
  );

  const sorted = [...compatible].sort((a, b) => b.name.length - a.name.length);

  for (const cat of sorted) {
    const catLower = normalizeText(cat.name);
    const idx = lower.indexOf(catLower);
    if (idx !== -1) {
      const remaining = (text.slice(0, idx) + text.slice(idx + catLower.length))
        .replace(/\s+/g, ' ')
        .trim();
      return { categoryId: cat.id, categoryName: cat.name, remaining };
    }
  }

  return null;
}

function isUndoIntent(lower: string): boolean {
  const clean = lower.trim();
  const exactUndoKeywords = [
    'hủy', 'huy', 'hoàn tác', 'hoan tac', 'undo', 'xóa đi', 'xoa di',
    'nhầm rồi', 'nham roi', 'sai rồi', 'sai roi', 'bỏ đi', 'bo di',
    'cancel', 'xóa', 'xoa', 'huỷ', 'huỷ bỏ', '/undo', '/cancel',
  ];
  if (exactUndoKeywords.includes(clean)) return true;

  if (
    clean.length <= 25 &&
    /^(?:hủy|huy|hoàn tác|hoan tac|xóa|xoa|undo)\s+(?:giao dịch|gd|vừa rồi|vừa tạo|này|nay|di|đi)?$/i.test(clean)
  ) {
    return true;
  }

  return false;
}

function hasEditKeyword(lower: string): boolean {
  return EDIT_KEYWORDS.some((k) => lower.includes(k));
}

// ─── Main Parser ──────────────────────────────────────────────────────────────

export class ZaloBotMicroParser {
  /**
   * Phân tích tin nhắn hội thoại đến từ người dùng.
   *
   * @param text         - Nội dung tin nhắn thô
   * @param context      - Ngữ cảnh thực thể User (categories + wallets)
   * @param botCtx       - Ngữ cảnh Redis hội thoại gần nhất (có thể null nếu chưa có)
   * @param isQuoteReply - True nếu tin nhắn này là trượt để trả lời (Quote-Reply) tin nhắn Bot
   * @returns            - ParsedIntent: MutationAST | DeltaPatchAST | UndoIntent | AmbiguousIntent
   */
  static parse(
    text: string,
    context: EntityContext,
    botCtx: BotConversationContext | null,
    isQuoteReply = false,
  ): ParsedIntent {
    const raw = text.trim();
    const lower = normalizeText(raw);

    // ── 1. Ý định Hoàn tác ─────────────────────────────────────────────────
    if (isUndoIntent(lower)) {
      if (botCtx?.lastTransactionId) {
        return {
          action: 'UNDO_TRANSACTION',
          transactionId: botCtx.lastTransactionId,
        } satisfies UndoIntent;
      }
      return {
        action: 'AMBIGUOUS',
        missingField: 'amount',
        partial: {},
      } satisfies AmbiguousIntent;
    }

    // ── 2. Ý định Sửa vi sai (Delta Patch) khi có ngữ cảnh hội thoại ──────
    // CHỈ kích hoạt sửa khi:
    //   a) Có quote-reply vào tin nhắn bot cũ, HOẶC
    //   b) Tin nhắn chứa từ khóa sửa rõ ràng ("sửa", "đổi", "nhầm", "thay")
    // Tuyệt đối không cướp tin nhắn tạo mới thông thường (VD: "Ăn trưa 50k").
    if (botCtx?.lastTransactionId && (isQuoteReply || hasEditKeyword(lower))) {
      const patch = ZaloBotMicroParser.tryParseDelta(
        raw,
        lower,
        botCtx.lastTransactionId,
        context,
        isQuoteReply,
      );
      if (patch) return patch;
    }

    // ── 3. Ý định Tạo giao dịch mới ────────────────────────────────────────
    return ZaloBotMicroParser.parseMutation(raw, lower, context);
  }

  // ── Delta Patch Parser ────────────────────────────────────────────────────

  private static tryParseDelta(
    raw: string,
    lower: string,
    transactionId: string,
    context: EntityContext,
    isQuoteReply: boolean,
  ): DeltaPatchAST | null {
    const patch: DeltaPatchAST = {
      action: 'PATCH_TRANSACTION',
      transactionId,
    };
    let hasChange = false;

    // 1. Kiểm tra sửa số tiền qua từ khóa sửa rõ ràng
    for (const p of EDIT_AMOUNT_PATTERNS) {
      const m = lower.match(p);
      if (m) {
        const amt = parseAmount(m[1], m[2]);
        if (amt > 0) {
          patch.amount = amt;
          hasChange = true;
          break;
        }
      }
    }

    // Nếu là Quote-Reply và người dùng chỉ gửi số tiền gọn (VD: quote tin nhắn bot rồi gõ "40k" hoặc "40.000")
    if (!hasChange && isQuoteReply) {
      const bareMatch = lower.trim().match(QUOTE_REPLY_BARE_AMOUNT_PATTERN);
      if (bareMatch) {
        const amt = parseAmount(bareMatch[1], bareMatch[2]);
        if (amt > 0) {
          patch.amount = amt;
          hasChange = true;
        }
      }
    }

    // 2. Kiểm tra đổi ví
    for (const p of EDIT_WALLET_PATTERNS) {
      const m = raw.match(p);
      if (m) {
        const afterKeyword = m[1].trim();
        const walletResult = extractWallet(afterKeyword, context.wallets, null);
        if (walletResult) {
          patch.walletId = walletResult.walletId;
          patch.walletName = walletResult.walletName;
          hasChange = true;
          break;
        }
      }
    }

    // 3. Kiểm tra đổi danh mục
    for (const p of EDIT_CATEGORY_PATTERNS) {
      const m = raw.match(p);
      if (m) {
        const afterKeyword = m[1].trim();
        const catResult = extractCategory(afterKeyword, TransactionType.EXPENSE, context.categories);
        if (catResult) {
          patch.categoryId = catResult.categoryId;
          patch.categoryName = catResult.categoryName;
          hasChange = true;
          break;
        }
      }
    }

    // 4. Kiểm tra thêm/sửa ghi chú
    for (const p of EDIT_DESCRIPTION_PATTERNS) {
      const m = raw.match(p);
      if (m) {
        patch.description = m[1].trim();
        hasChange = true;
        break;
      }
    }

    // 5. Kiểm tra đổi loại (INCOME ↔ EXPENSE)
    if (!hasChange && hasEditKeyword(lower)) {
      const newType = extractTransactionType(lower);
      if (lower.includes('thu') || lower.includes('income') || lower.includes('lương')) {
        patch.type = newType;
        hasChange = true;
      }
    }

    return hasChange ? patch : null;
  }

  // ── Mutation Parser ───────────────────────────────────────────────────────

  private static parseMutation(
    raw: string,
    lower: string,
    context: EntityContext,
  ): MutationAST | AmbiguousIntent {
    // Bước 1: Trích xuất số tiền
    const { amount, remaining: afterAmount } = extractAmount(lower);

    if (amount === 0) {
      return {
        action: 'AMBIGUOUS',
        missingField: 'amount',
        partial: {},
      } satisfies AmbiguousIntent;
    }

    // Bước 2: Phân loại loại giao dịch
    const type = extractTransactionType(lower);

    // Bước 3: Tìm Ví
    const walletResult = extractWallet(afterAmount, context.wallets, context.defaultWalletId);
    if (!walletResult) {
      return {
        action: 'AMBIGUOUS',
        missingField: 'wallet',
        partial: { amount, type },
      } satisfies AmbiguousIntent;
    }

    // Bước 4: Tìm danh mục từ phần text còn lại (sau khi bỏ tiền và ví)
    const afterWallet = walletResult.remaining;
    const catResult = extractCategory(afterWallet, type, context.categories);

    if (!catResult) {
      return {
        action: 'AMBIGUOUS',
        missingField: 'category',
        partial: { amount, type, walletName: walletResult.walletName },
      } satisfies AmbiguousIntent;
    }

    // Bước 5: Phần còn lại là ghi chú
    const description = catResult.remaining
      .replace(/\b(vừa|mới|vừa mới|sáng|trưa|chiều|tối|đêm|nay|hôm nay)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Bước 6: Tính điểm tin cậy
    const confidence = catResult ? (walletResult.walletId !== context.defaultWalletId ? 0.9 : 0.75) : 0.5;

    return {
      action: 'CREATE_TRANSACTION',
      type,
      amount,
      categoryId: catResult.categoryId,
      categoryName: catResult.categoryName,
      walletId: walletResult.walletId,
      walletName: walletResult.walletName,
      description,
      confidence,
    } satisfies MutationAST;
  }
}
