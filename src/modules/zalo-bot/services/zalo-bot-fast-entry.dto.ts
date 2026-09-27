import { TransactionType } from '@prisma/client';

/**
 * Kết quả phân tích AST của một tin nhắn ghi chép giao dịch nhanh.
 * Mọi thực thể (category, wallet) đều được đối chiếu chính xác với DB của User;
 * không có ngữ nghĩa nào được suy diễn bởi LLM.
 */
export interface MutationAST {
  action: 'CREATE_TRANSACTION';
  /** Fast-entry chỉ hỗ trợ INCOME và EXPENSE; Transfer dùng mô hình riêng không đi qua FastEntry. */
  type: 'INCOME' | 'EXPENSE';
  /** Số tiền đã chuẩn hóa về đơn vị VND nguyên (integer). */
  amount: number;
  /** ID danh mục trong DB khớp với từ khóa trong tin nhắn. */
  categoryId: string;
  categoryName: string;
  /** ID ví trong DB khớp với từ khóa trong tin nhắn. */
  walletId: string;
  walletName: string;
  /** Phần text còn lại sau khi trích xuất tiền, loại và ví → dùng làm ghi chú. */
  description: string;
  /** Điểm tin cậy 0.0 – 1.0; < 0.5 cần hỏi lại người dùng. */
  confidence: number;
}

/**
 * AST sửa đổi vi sai (Delta Patch) khi người dùng reply tin nhắn cũ để chỉnh sửa.
 * Chỉ chứa các trường thực sự thay đổi; trường không đề cập giữ nguyên giá trị gốc.
 */
export interface DeltaPatchAST {
  action: 'PATCH_TRANSACTION';
  /** ID giao dịch gốc cần sửa (tra từ Redis context). */
  transactionId: string;
  amount?: number;
  categoryId?: string;
  categoryName?: string;
  walletId?: string;
  walletName?: string;
  description?: string;
  /** Chỉ cho phép đổi giữa INCOME và EXPENSE. */
  type?: 'INCOME' | 'EXPENSE';
}

/** Ý định hoàn tác giao dịch gần nhất. */
export interface UndoIntent {
  action: 'UNDO_TRANSACTION';
  transactionId: string;
}

/** Ý định không rõ — bot sẽ hỏi lại. */
export interface AmbiguousIntent {
  action: 'AMBIGUOUS';
  /** Thông tin còn thiếu để hoàn thành việc ghi chép. */
  missingField: 'amount' | 'category' | 'wallet';
  /** Phần bộ phân tích nhận diện được, hiển thị lại để hỏi bổ sung. */
  partial: Partial<Pick<MutationAST, 'amount' | 'categoryName' | 'walletName' | 'type'>>;
}

export type ParsedIntent = MutationAST | DeltaPatchAST | UndoIntent | AmbiguousIntent;

/** Kết quả ghi sổ cái trả về sau khi tạo giao dịch thành công. */
export interface FastEntryResult {
  transactionId: string;
  type: TransactionType;
  amount: number;
  categoryName: string;
  walletName: string;
  newBalance: number;
  currency: string;
  description: string;
  date: string; // YYYY-MM-DD
  /** Thông tin ngân sách danh mục tương ứng (nếu có). */
  budget?: {
    name: string;
    usagePercentage: number;
    remainingAmount: number;
    currency: string;
    status: 'ON_TRACK' | 'NEAR_LIMIT' | 'EXCEEDED';
  } | null;
}

/** Ngữ cảnh hội thoại lưu trong Redis cho mỗi chatId. */
export interface BotConversationContext {
  /** ID giao dịch vừa được tạo qua bot (dùng cho Undo và Patch). */
  lastTransactionId: string;
  /** userId chủ sở hữu giao dịch. */
  userId: string;
  /** Timestamp tạo (để tính TTL dự phòng). */
  createdAt: number;
}
