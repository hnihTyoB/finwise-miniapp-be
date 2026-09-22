import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.client';

export type RepositoryTransaction = Prisma.TransactionClient;

export class BackupRepository {
  /**
   * Lấy toàn bộ dữ liệu tài chính của người dùng phục vụ cho việc sao lưu (Export)
   */
  async getUserFullData(userId: string) {
    const [wallets, categories, transactions, transfers, budgets, savingGoals] =
      await Promise.all([
        prisma.wallet.findMany({
          where: { userId },
          orderBy: { createdAt: 'asc' },
        }),
        prisma.category.findMany({
          where: { userId, isSystem: false },
          orderBy: { createdAt: 'asc' },
        }),
        prisma.transaction.findMany({
          where: { userId },
          orderBy: { date: 'asc' },
        }),
        prisma.transfer.findMany({
          where: { userId },
          orderBy: { transferredAt: 'asc' },
        }),
        prisma.budget.findMany({
          where: { userId },
          orderBy: { startDate: 'asc' },
        }),
        prisma.savingGoal.findMany({
          where: { userId },
          include: {
            contributions: {
              orderBy: { contributedAt: 'asc' },
            },
          },
          orderBy: { createdAt: 'asc' },
        }),
      ]);

    return {
      wallets,
      categories,
      transactions,
      transfers,
      budgets,
      savingGoals,
    };
  }

  /**
   * Thống kê nhanh dữ liệu hiện có của người dùng (phục vụ Preview trạng thái EMPTY vs HAS_DATA)
   */
  async getUserDataStats(userId: string) {
    const [walletsCount, transactionsCount, categoriesCount] = await Promise.all([
      prisma.wallet.count({ where: { userId, isArchived: false } }),
      prisma.transaction.count({ where: { userId } }),
      prisma.category.count({ where: { userId, isArchived: false } }),
    ]);

    return {
      walletsCount,
      transactionsCount,
      categoriesCount,
      isAccountEmpty: walletsCount === 0 && transactionsCount === 0,
    };
  }

  /**
   * Lấy danh sách ví đang hoạt động của người dùng
   */
  async getUserActiveWallets(userId: string, tx?: RepositoryTransaction) {
    const client = tx || prisma;
    return client.wallet.findMany({
      where: { userId, isArchived: false },
      select: {
        id: true,
        name: true,
        balance: true,
        currency: true,
        isDefault: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Lấy danh mục đang hoạt động của người dùng (kèm danh mục hệ thống) để map
   */
  async getUserAndSystemCategories(userId: string, tx?: RepositoryTransaction) {
    const client = tx || prisma;
    return client.category.findMany({
      where: {
        isArchived: false,
        OR: [{ userId }, { isSystem: true }],
      },
      select: {
        id: true,
        userId: true,
        name: true,
        type: true,
        icon: true,
        color: true,
        parentId: true,
        isSystem: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Lấy danh sách giao dịch hiện có để phát hiện và chống trùng lặp (Deduplication)
   */
  async findExistingTransactions(userId: string, tx?: RepositoryTransaction) {
    const client = tx || prisma;
    return client.transaction.findMany({
      where: { userId },
      select: {
        id: true,
        walletId: true,
        date: true,
        amount: true,
        type: true,
        description: true,
      },
    });
  }

  /**
   * Lấy danh sách chuyển tiền hiện có để chống trùng lặp
   */
  async findExistingTransfers(userId: string, tx?: RepositoryTransaction) {
    const client = tx || prisma;
    return client.transfer.findMany({
      where: { userId },
      select: {
        id: true,
        sourceWalletId: true,
        destinationWalletId: true,
        amount: true,
        transferredAt: true,
        note: true,
      },
    });
  }

  /**
   * Chạy transaction nguyên tử với mức cô lập cao (Serializable)
   */
  async runSerializable<T>(
    callback: (tx: RepositoryTransaction) => Promise<T>,
  ): Promise<T> {
    return prisma.$transaction(callback, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 120000, // 2 minutes for large datasets
      maxWait: 15000,
    });
  }

  /**
   * Ghi vết kiểm toán (AuditLog)
   */
  async createAuditLog(
    entry: {
      actorId: string;
      action: string;
      targetType: string;
      targetId?: string;
      previousState?: any;
      newState?: any;
      ipAddress?: string;
      userAgent?: string;
    },
    tx?: RepositoryTransaction,
  ) {
    const client = tx || prisma;
    return client.auditLog.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        previousState: entry.previousState ? JSON.stringify(entry.previousState) : undefined,
        newState: entry.newState ? JSON.stringify(entry.newState) : undefined,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
      },
    });
  }
}
