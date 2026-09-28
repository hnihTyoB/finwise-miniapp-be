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

// ─── Tên tiếng Việt và Từ đồng nghĩa cho Danh mục Hệ thống ───────────────────

export const CATEGORY_VIETNAMESE_NAMES: Record<string, string> = {
  Salary: 'Lương',
  Investment: 'Đầu tư',
  'Other Income': 'Thu nhập khác',
  'Food & Dining': 'Ăn uống',
  Groceries: 'Đi chợ',
  Restaurants: 'Nhà hàng',
  Transport: 'Di chuyển',
  Shopping: 'Mua sắm',
  'Bills & Utilities': 'Hóa đơn & tiện ích',
  Health: 'Sức khỏe',
  Entertainment: 'Giải trí',
  Education: 'Giáo dục',
  Housing: 'Nhà ở',
  Travel: 'Du lịch',
  'Personal Care': 'Chăm sóc cá nhân',
  'Gifts & Donations': 'Quà tặng & từ thiện',
  'Other Expense': 'Chi tiêu khác',
};

export function formatCategoryDisplayName(categoryName: string): string {
  const vi = CATEGORY_VIETNAMESE_NAMES[categoryName];
  return vi ? `${vi} (${categoryName})` : categoryName;
}

export const SYSTEM_CATEGORY_SYNONYMS: Record<string, string[]> = {
  'Food & Dining': [
    'ăn uống', 'an uong', 'ăn trưa', 'an trua', 'ăn sáng', 'an sang', 'ăn tối', 'an toi',
    'ăn đêm', 'an dem', 'cơm trưa', 'com trua', 'cơm', 'com', 'phở', 'pho', 'bún', 'bun',
    'bánh mì', 'banh mi', 'cà phê', 'ca phe', 'cafe', 'coffee', 'cf', 'trà sữa', 'tra sua',
    'trà', 'tra', 'nước', 'nuoc', 'ăn vặt', 'an vat', 'đồ ăn', 'do an', 'thức ăn', 'thuc an',
    'đi ăn', 'di an', 'quán ăn', 'quan an', 'tiệc', 'tiec', 'nhậu', 'nhau', 'bia', 'food',
    'dining', 'drink', 'drinks', 'ăn tiệm', 'an tiem', 'trà chanh', 'tra chanh',
  ],
  Restaurants: [
    'nhà hàng', 'nha hang', 'quán', 'quan', 'buffet', 'lẩu', 'lau', 'nướng', 'nuong', 'bbq',
    'restaurant', 'restaurants', 'quán nhậu', 'quan nhau',
  ],
  Groceries: [
    'đi chợ', 'di cho', 'chợ', 'siêu thị', 'sieu thi', 'bách hóa', 'bach hoa',
    'thực phẩm', 'thuc pham', 'mua đồ ăn', 'mua do an', 'rau', 'thịt', 'thit', 'cá',
    'trứng', 'trung', 'groceries', 'grocery', 'supermarket', 'mua rau', 'mua thịt',
  ],
  Transport: [
    'di chuyển', 'di chuyen', 'đi lại', 'di lai', 'đổ xăng', 'do xang', 'tiền xăng', 'tien xang',
    'xăng', 'xang', 'gửi xe', 'gui xe', 'vé xe', 've xe', 'xe bus', 'bus', 'xe buýt', 'xe buyt',
    'grab', 'be', 'gojek', 'xanh sm', 'taxi', 'rửa xe', 'rua xe', 'sửa xe', 'sua xe',
    'bảo dưỡng xe', 'bao duong xe', 'thay nhớt', 'thay nhot', 'cầu đường', 'cau duong',
    'vé máy bay', 've may bay', 'tàu hỏa', 'tau hoa', 'transport', 'transportation',
  ],
  Shopping: [
    'mua sắm', 'mua sam', 'mua đồ', 'mua do', 'quần áo', 'quan ao', 'giày dép', 'giay dep',
    'mỹ phẩm', 'my pham', 'son', 'shopee', 'lazada', 'tiki', 'tiktok shop', 'mua sắm online',
    'đồ dùng', 'do dung', 'gia dụng', 'gia dung', 'shopping', 'mua áo', 'mua quần',
  ],
  'Bills & Utilities': [
    'hóa đơn', 'hoa don', 'tiện ích', 'tien ich', 'tiền điện', 'tien dien', 'tiền nước', 'tien nuoc',
    'tiền mạng', 'tien mang', 'wifi', 'internet', 'điện thoại', 'dien thoai', 'nạp thẻ', 'nap the',
    'tiền rác', 'tien rac', 'phí quản lý', 'phi quan ly', 'bills', 'utilities',
  ],
  Health: [
    'sức khỏe', 'suc khoe', 'y tế', 'y te', 'thuốc', 'thuoc', 'mua thuốc', 'mua thuoc',
    'tiệm thuốc', 'tiem thuoc', 'nhà thuốc', 'nha thuoc', 'bác sĩ', 'bac si', 'khám bệnh', 'kham benh',
    'bệnh viện', 'benh vien', 'nha khoa', 'nha khoa', 'răng', 'rang', 'vitamin', 'khẩu trang',
    'health', 'medical', 'medicine',
  ],
  Entertainment: [
    'giải trí', 'giai tri', 'xem phim', 'xem phim', 'cinema', 'rạp phim', 'rap phim', 'vé phim',
    'game', 'nạp game', 'nap game', 'netflix', 'spotify', 'youtube', 'karaoke', 'hát',
    'bida', 'bowling', 'du lịch', 'du lich', 'vui chơi', 'vui choi', 'entertainment',
  ],
  Education: [
    'giáo dục', 'giao duc', 'học phí', 'hoc phi', 'tiền học', 'tien hoc', 'khóa học', 'khoa hoc',
    'sách', 'sach', 'mua sách', 'mua sach', 'vở', 'vo', 'bút', 'but', 'education',
  ],
  Housing: [
    'nhà ở', 'nha o', 'tiền nhà', 'tien nha', 'tiền trọ', 'tien tro', 'thuê nhà', 'thue nha',
    'chung cư', 'chung cu', 'sửa nhà', 'sua nha',
  ],
  Salary: [
    'lương', 'luong', 'tiền lương', 'tien luong', 'bảng lương', 'bang luong', 'salary', 'income',
  ],
  Investment: [
    'đầu tư', 'dau tu', 'chứng khoán', 'chung khoan', 'cổ phiếu', 'co phieu', 'tiết kiệm', 'tiet kiem',
    'tiền lãi', 'tien lai', 'lãi', 'lai', 'crypto', 'coin', 'vàng', 'vang', 'investment',
  ],
  'Other Income': [
    'thu nhập khác', 'thu nhap khac', 'thưởng', 'thuong', 'tiền thưởng', 'tien thuong',
    'bonus', 'hoàn tiền', 'hoan tien', 'bán đồ', 'ban do', 'quà tặng', 'qua tang', 'lì xì', 'li xi',
    'khách trả', 'khach tra', 'other income',
  ],
  'Other Expense': [
    'chi tiêu khác', 'chi tieu khac', 'chi khác', 'chi khac', 'other expense',
  ],
};

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
  /(?:đổi\s+sang\s+)(.+)/i,
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
 * Loại bỏ dấu tiếng Việt để so khớp không dấu (vd: "Quỹ đen" -> "quy den", "Tiền mặt" -> "tien mat").
 * Giữ nguyên độ dài chuỗi 1-1 với chuỗi gốc để việc cắt chuỗi (substring) chính xác.
 */
export function stripDiacritics(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, (m) => (m === 'đ' ? 'd' : 'D'))
    .toLowerCase()
    .trim();
}

/**
 * Từ điển biệt danh phổ biến của ngân hàng & ví điện tử Việt Nam.
 * Giúp nhận diện khi người dùng đặt tên ví là "Vietcombank" nhưng chat "vcb",
 * hoặc đặt là "VCB" nhưng chat "vietcombank", "Tiền mặt" nhưng chat "cash".
 */
export const BANK_WALLET_ALIASES: Record<string, string[]> = {
  vcb: ['vietcombank', 'ngan hang ngoai thuong'],
  vietcombank: ['vcb', 'vietcom'],
  tcb: ['techcombank', 'techcom'],
  techcombank: ['tcb', 'techcom'],
  bidv: ['dau tu va phat trien'],
  ctg: ['vietinbank', 'viettinbank', 'vietin'],
  vietinbank: ['ctg', 'vietin', 'viettinbank'],
  mbbank: ['mb', 'quan doi', 'mb bank'],
  mb: ['mbbank', 'quan doi', 'mb bank'],
  acb: ['a chau'],
  tpbank: ['tpb', 'tien phong'],
  tpb: ['tpbank', 'tien phong'],
  vpbank: ['vpb', 'thinh vuong'],
  vpb: ['vpbank', 'thinh vuong'],
  sacombank: ['stb', 'sai gon thuong tin'],
  stb: ['sacombank'],
  hdbank: ['hdb'],
  vib: ['quoc te'],
  shb: ['sai gon ha noi'],
  msb: ['hang hai'],
  ocb: ['phuong dong'],
  momo: ['vi momo'],
  zalopay: ['zalo pay', 'vi zalo', 'vi zalopay'],
  shopeepay: ['shopee pay', 'airpay'],
  cash: ['tien mat', 'tien tui'],
  'tien mat': ['cash', 'tien tui'],
};

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
  const cleanText = text.trim();
  const lower = normalizeText(cleanText);
  const stripped = stripDiacritics(cleanText);

  // Sắp xếp ví theo độ dài tên giảm dần để ưu tiên tên dài hơn
  const sorted = [...wallets].sort((a, b) => b.name.length - a.name.length);

  // ── Bước 1: Khớp có tiền tố rõ ràng ("ví", "vi", "tk", "tài khoản", "tai khoan") ──
  // Áp dụng cho MỌI tên ví (kể cả tên tự đặt, lạ, xàm như "quỹ đen", "ví giấu vợ", "heo đất", "ví 1", "tiền lẻ")
  for (const w of sorted) {
    const wLower = normalizeText(w.name);
    const wStripped = stripDiacritics(w.name);
    const aliases = [wLower, wStripped];
    const bankAl = BANK_WALLET_ALIASES[wStripped] || [];
    for (const a of bankAl) {
      aliases.push(a);
    }

    const uniqueAliases = Array.from(new Set(aliases)).sort((a, b) => b.length - a.length);

    for (const alias of uniqueAliases) {
      const prefixedPatterns = [
        `ví ${alias}`,
        `vi ${alias}`,
        `tài khoản ${alias}`,
        `tai khoan ${alias}`,
        `tk ${alias}`,
      ];

      for (const p of prefixedPatterns) {
        let searchStart = 0;
        while (searchStart < lower.length) {
          let idx = lower.indexOf(p, searchStart);
          let matchLen = p.length;

          if (idx === -1) {
            const pStripped = stripDiacritics(p);
            idx = stripped.indexOf(pStripped, searchStart);
            matchLen = pStripped.length;
          }

          if (idx === -1) break;

          // Kiểm tra word boundary trước và sau (tránh ví dụ: "tk 1" khớp vào "tk 100k", "ví vcb" khớp "ví vcba")
          const prevChar = idx > 0 ? lower[idx - 1] : ' ';
          const nextChar = idx + matchLen < lower.length ? lower[idx + matchLen] : ' ';
          const isWordBoundary = /[\s,.\-!?:;/()]/.test(prevChar) && /[\s,.\-!?:;/()]/.test(nextChar);

          if (isWordBoundary) {
            const remaining = (cleanText.slice(0, idx) + cleanText.slice(idx + matchLen))
              .replace(/\s+/g, ' ')
              .trim();
            return { walletId: w.id, walletName: w.name, remaining };
          }

          searchStart = idx + 1;
        }
      }
    }
  }

  // ── Bước 2: Khớp tên ví đứng độc lập (không có tiền tố "ví") ──
  // Áp dụng cho tên ví có độ dài >= 2 ký tự và không nằm trong các từ loại trừ thông thường
  const genericExcluded = new Set(['tiền', 'tien', 'chi', 'thu', 'ăn', 'an', 'xe', 'ví', 'vi', 'đổi', 'doi']);

  for (const w of sorted) {
    const wLower = normalizeText(w.name);
    const wStripped = stripDiacritics(w.name);
    const aliases = [wLower, wStripped];
    const bankAl = BANK_WALLET_ALIASES[wStripped] || [];
    for (const a of bankAl) {
      aliases.push(a);
    }

    const uniqueAliases = Array.from(new Set(aliases))
      .filter((a) => a.length >= 2 && !genericExcluded.has(a))
      .sort((a, b) => b.length - a.length);

    for (const alias of uniqueAliases) {
      let searchStart = 0;
      while (searchStart < lower.length) {
        let idx = lower.indexOf(alias, searchStart);
        let matchLen = alias.length;

        if (idx === -1) {
          idx = stripped.indexOf(alias, searchStart);
          matchLen = alias.length;
        }

        if (idx === -1) break;

        // Kiểm tra word boundary trước và sau
        const prevChar = idx > 0 ? lower[idx - 1] : ' ';
        const nextChar = idx + matchLen < lower.length ? lower[idx + matchLen] : ' ';
        const isWordBoundary = /[\s,.\-!?:;/()]/.test(prevChar) && /[\s,.\-!?:;/()]/.test(nextChar);

        if (isWordBoundary) {
          const remaining = (cleanText.slice(0, idx) + cleanText.slice(idx + matchLen))
            .replace(/\s+/g, ' ')
            .trim();
          return { walletId: w.id, walletName: w.name, remaining };
        }

        searchStart = idx + 1;
      }
    }
  }

  // ── Bước 3: Kiểm tra người dùng có gõ rõ ràng tiền tố ví nhưng tên ví không khớp ──
  // Ví dụ người dùng gõ "ví momo" nhưng không có ví momo trong tài khoản
  // Không nên âm thầm trừ tiền vào ví mặc định!
  const hasExplicitWalletPrefix = /(?:^|\s)(?:ví|vi|tài khoản|tai khoan|tk)\s+(\S+)/i.test(lower);
  if (hasExplicitWalletPrefix) {
    return null;
  }

  // ── Bước 4: Fallback về ví mặc định nếu không nhắc đến ví nào ──
  if (defaultWalletId) {
    const defaultWallet = wallets.find((w) => w.id === defaultWalletId);
    if (defaultWallet) {
      return { walletId: defaultWallet.id, walletName: defaultWallet.name, remaining: cleanText };
    }
  }

  return null;
}

function extractCategory(
  text: string,
  type: TransactionType,
  categories: EntityContext['categories'],
): { categoryId: string; categoryName: string; remaining: string } | null {
  const cleanText = text.trim();
  const lower = normalizeText(cleanText);

  // Lọc đúng theo loại giao dịch (INCOME vs EXPENSE)
  const strictlyCompatible = categories.filter((c) => c.type === type);
  const compatible = strictlyCompatible.length > 0 ? strictlyCompatible : categories;

  // 1. Khớp theo tên danh mục trực tiếp (tên tự tạo hoặc tên hệ thống tiếng Anh/Việt)
  const sortedByName = [...compatible].sort((a, b) => b.name.length - a.name.length);

  for (const cat of sortedByName) {
    const catLower = normalizeText(cat.name);
    let searchStart = 0;
    while (searchStart < lower.length) {
      const idx = lower.indexOf(catLower, searchStart);
      if (idx === -1) break;

      const prevChar = idx > 0 ? lower[idx - 1] : ' ';
      const nextChar = idx + catLower.length < lower.length ? lower[idx + catLower.length] : ' ';
      const isWordBoundary = /[\s,.\-!?:;/()]/.test(prevChar) && /[\s,.\-!?:;/()]/.test(nextChar);

      if (isWordBoundary) {
        const remaining = (cleanText.slice(0, idx) + cleanText.slice(idx + catLower.length))
          .replace(/\s+/g, ' ')
          .trim();
        return { categoryId: cat.id, categoryName: cat.name, remaining };
      }

      searchStart = idx + 1;
    }
  }

  // 2. Khớp theo từ đồng nghĩa tiếng Việt của danh mục hệ thống
  const synonymCandidates: Array<{
    cat: EntityContext['categories'][number];
    syn: string;
    len: number;
  }> = [];

  for (const cat of compatible) {
    const synonyms = SYSTEM_CATEGORY_SYNONYMS[cat.name] || [];
    for (const syn of synonyms) {
      synonymCandidates.push({ cat, syn, len: syn.length });
    }
  }

  // Ưu tiên khớp các cụm từ dài trước (ví dụ "cà phê sáng" hoặc "ăn trưa" trước "ăn")
  synonymCandidates.sort((a, b) => b.len - a.len);

  for (const item of synonymCandidates) {
    let searchStart = 0;
    while (searchStart < lower.length) {
      const idx = lower.indexOf(item.syn, searchStart);
      if (idx === -1) break;

      const prevChar = idx > 0 ? lower[idx - 1] : ' ';
      const nextChar = idx + item.syn.length < lower.length ? lower[idx + item.syn.length] : ' ';
      const isWordBoundary = /[\s,.\-!?:;/()]/.test(prevChar) && /[\s,.\-!?:;/()]/.test(nextChar);

      if (isWordBoundary) {
        const remaining = (cleanText.slice(0, idx) + cleanText.slice(idx + item.syn.length))
          .replace(/\s+/g, ' ')
          .trim();
        return { categoryId: item.cat.id, categoryName: item.cat.name, remaining };
      }

      searchStart = idx + 1;
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
