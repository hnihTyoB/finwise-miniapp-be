import {
  DebtScheduleStatus,
  DebtStatus,
  Prisma,
  TransactionType,
} from '@prisma/client';
import { prisma } from '../../database/prisma.client';
import { DebtContractQueryDto, UpdateDebtContractDto } from './debt.dto';

export type RepositoryTransaction = Prisma.TransactionClient;

function client(tx?: RepositoryTransaction) {
  return tx ?? prisma;
}

export class DebtRepository {
  /**
   * Chạy một khối logic trong transaction với isolation level Serializable và retry cơ chế P2034
   */
  async runSerializable<T>(
    operation: (transaction: RepositoryTransaction) => Promise<T>,
  ): Promise<T> {
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10000,
          timeout: 15000,
        });
      } catch (error) {
        const shouldRetry =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034' &&
          attempt < maxAttempts;

        if (!shouldRetry) {
          throw error;
        }
      }
    }

    throw new Error('Serializable transaction retry limit reached');
  }

  /**
   * Tạo hợp đồng nợ và toàn bộ các kỳ trong bảng lịch trả nợ trong một Transaction nguyên tử
   */
  async createWithSchedule(
    contractData: Prisma.DebtContractUncheckedCreateInput,
    scheduleItems: Omit<Prisma.DebtScheduleItemUncheckedCreateInput, 'debtContractId'>[],
  ) {
    return prisma.$transaction(async (tx) => {
      const contract = await tx.debtContract.create({
        data: contractData,
      });

      const scheduleData = scheduleItems.map((item) => ({
        ...item,
        debtContractId: contract.id,
      }));

      await tx.debtScheduleItem.createMany({
        data: scheduleData,
      });

      return tx.debtContract.findUnique({
        where: { id: contract.id },
        include: {
          wallet: {
            select: { id: true, name: true, currency: true },
          },
          scheduleItems: {
            orderBy: { period: 'asc' },
          },
        },
      });
    });
  }

  /**
   * Lấy danh sách hợp đồng nợ kèm phân trang và bộ lọc
   */
  async findAll(userId: string, query: DebtContractQueryDto) {
    const { type, status, isArchived = false, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.DebtContractWhereInput = {
      userId,
      isArchived,
      ...(type && { type }),
      ...(status && { status }),
    };

    const [total, items] = await Promise.all([
      prisma.debtContract.count({ where }),
      prisma.debtContract.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          wallet: {
            select: { id: true, name: true, currency: true },
          },
          _count: {
            select: { scheduleItems: true },
          },
        },
      }),
    ]);

    const pagination = {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };

    return {
      data: items,
      items,
      meta: pagination,
      pagination,
    };
  }

  /**
   * Tìm chi tiết một hợp đồng nợ theo ID và userId
   */
  async findById(id: string, userId: string) {
    return prisma.debtContract.findFirst({
      where: { id, userId },
      include: {
        wallet: {
          select: { id: true, name: true, currency: true, balance: true },
        },
        scheduleItems: {
          orderBy: { period: 'asc' },
        },
      },
    });
  }

  /**
   * Cập nhật thông tin mô tả / ví của hợp đồng nợ
   */
  async update(id: string, userId: string, data: UpdateDebtContractDto) {
    return prisma.debtContract.updateMany({
      where: { id, userId },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.counterparty && { counterparty: data.counterparty }),
        ...(data.walletId !== undefined && { walletId: data.walletId }),
        ...(data.notes !== undefined && { notes: data.notes }),
      },
    });
  }

  /**
   * Lưu trữ (Soft Delete / Archive) hợp đồng nợ
   */
  async archive(id: string, userId: string) {
    return prisma.debtContract.updateMany({
      where: { id, userId },
      data: {
        isArchived: true,
        status: 'CANCELLED',
      },
    });
  }

  /**
   * Lấy tổng quan số dư nợ phải trả và cho vay của người dùng
   */
  async getSummary(userId: string) {
    const activeContracts = await prisma.debtContract.findMany({
      where: {
        userId,
        isArchived: false,
        status: { in: ['ACTIVE', 'OVERDUE'] },
      },
      select: {
        type: true,
        remainingPrincipal: true,
      },
    });

    let totalBorrowing = new Prisma.Decimal(0);
    let totalLending = new Prisma.Decimal(0);

    for (const contract of activeContracts) {
      if (contract.type === 'DEBT_PAYABLE') {
        totalBorrowing = totalBorrowing.add(contract.remainingPrincipal);
      } else {
        totalLending = totalLending.add(contract.remainingPrincipal);
      }
    }

    return {
      totalBorrowing: totalBorrowing.toNumber(),
      totalLending: totalLending.toNumber(),
    };
  }

  // ─── Settlement & Atomic Payment Operations ──────────────────────────────────

  /**
   * Tìm hợp đồng nợ kèm kỳ thanh toán cụ thể phục vụ thanh toán kỳ
   */
  async findContractWithInstallment(
    debtContractId: string,
    userId: string,
    period: number,
    tx?: RepositoryTransaction,
  ) {
    return client(tx).debtContract.findFirst({
      where: { id: debtContractId, userId },
      include: {
        scheduleItems: {
          where: { period },
        },
      },
    });
  }

  /**
   * Tìm hợp đồng nợ kèm các kỳ chưa hoàn tất phục vụ tất toán trước hạn
   */
  async findContractForEarlySettlement(
    debtContractId: string,
    userId: string,
    tx?: RepositoryTransaction,
  ) {
    return client(tx).debtContract.findFirst({
      where: { id: debtContractId, userId },
      include: {
        scheduleItems: {
          where: { status: { notIn: ['PAID', 'WAIVED'] } },
        },
      },
    });
  }

  /**
   * Tìm ví thanh toán của người dùng
   */
  async findWallet(walletId: string, userId: string, tx?: RepositoryTransaction) {
    return client(tx).wallet.findFirst({
      where: { id: walletId, userId },
    });
  }

  /**
   * Tìm ví mặc định của người dùng (hoặc ví đầu tiên đang hoạt động)
   */
  async findUserDefaultWallet(userId: string, tx?: RepositoryTransaction) {
    const defaultWallet = await client(tx).wallet.findFirst({
      where: { userId, isDefault: true, isArchived: false },
    });
    if (defaultWallet) return defaultWallet;

    return client(tx).wallet.findFirst({
      where: { userId, isArchived: false },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Cập nhật số dư ví
   */
  async updateWalletBalance(
    walletId: string,
    amount: Prisma.Decimal,
    mode: 'increment' | 'decrement',
    tx?: RepositoryTransaction,
  ) {
    return client(tx).wallet.update({
      where: { id: walletId },
      data: {
        balance: mode === 'decrement' ? { decrement: amount } : { increment: amount },
      },
    });
  }

  /**
   * Tìm hoặc tạo danh mục chi phí/thu nhập lãi vay
   */
  async getOrCreateInterestCategory(
    userId: string,
    type: TransactionType,
    tx?: RepositoryTransaction,
  ) {
    const categoryName =
      type === TransactionType.EXPENSE ? 'Chi phí lãi vay' : 'Thu nhập lãi cho vay';

    const existing = await client(tx).category.findFirst({
      where: {
        name: categoryName,
        type,
        isArchived: false,
        OR: [{ userId }, { isSystem: true, userId: null }],
      },
      select: { id: true },
    });

    if (existing) {
      return existing;
    }

    return client(tx).category.create({
      data: {
        userId,
        name: categoryName,
        type,
        isSystem: false,
        icon: type === TransactionType.EXPENSE ? 'percent' : 'trending-up',
        color: type === TransactionType.EXPENSE ? '#EF4444' : '#10B981',
      },
      select: { id: true },
    });
  }

  /**
   * Tạo bản ghi giao dịch lãi vay / phí phạt
   */
  async createInterestTransaction(
    data: {
      userId: string;
      walletId: string;
      categoryId: string;
      amount: Prisma.Decimal;
      type: TransactionType;
      date: Date;
      description: string;
    },
    tx?: RepositoryTransaction,
  ) {
    return client(tx).transaction.create({
      data: {
        userId: data.userId,
        walletId: data.walletId,
        categoryId: data.categoryId,
        amount: data.amount,
        type: data.type,
        date: data.date,
        description: data.description,
      },
      select: { id: true },
    });
  }

  /**
   * Cập nhật kỳ nợ sau khi thanh toán thành công
   */
  async updateInstallmentPaid(
    installmentId: string,
    data: {
      principalPaid: Prisma.Decimal;
      interestPaid: Prisma.Decimal;
      paidAt: Date;
      transactionId: string | null;
      notes?: string;
    },
    tx?: RepositoryTransaction,
  ) {
    return client(tx).debtScheduleItem.update({
      where: { id: installmentId },
      data: {
        principalPaid: data.principalPaid,
        interestPaid: data.interestPaid,
        status: 'PAID',
        paidAt: data.paidAt,
        transactionId: data.transactionId,
        ...(data.notes && { notes: data.notes }),
      },
    });
  }

  /**
   * Đếm số kỳ còn lại chưa thanh toán
   */
  async countUnpaidScheduleItems(
    debtContractId: string,
    excludeItemId?: string,
    tx?: RepositoryTransaction,
  ) {
    return client(tx).debtScheduleItem.count({
      where: {
        debtContractId,
        ...(excludeItemId && { id: { not: excludeItemId } }),
        status: { notIn: ['PAID', 'WAIVED'] },
      },
    });
  }

  /**
   * Cập nhật dư nợ và trạng thái của Hợp đồng nợ
   */
  async updateContractSettlement(
    contractId: string,
    data: {
      remainingPrincipal: Prisma.Decimal;
      status?: DebtStatus;
    },
    tx?: RepositoryTransaction,
  ) {
    return client(tx).debtContract.update({
      where: { id: contractId },
      data: {
        remainingPrincipal: data.remainingPrincipal,
        ...(data.status && { status: data.status }),
      },
      select: {
        id: true,
        name: true,
        status: true,
        remainingPrincipal: true,
      },
    });
  }

  /**
   * Đánh dấu toàn bộ các kỳ tương lai chưa thanh toán sang WAIVED khi tất toán sớm
   */
  async waiveFutureScheduleItems(
    debtContractId: string,
    notes = 'Miễn trừ do tất toán trước hạn',
    tx?: RepositoryTransaction,
  ) {
    return client(tx).debtScheduleItem.updateMany({
      where: {
        debtContractId,
        status: { notIn: ['PAID', 'WAIVED'] },
      },
      data: {
        status: 'WAIVED',
        notes,
      },
    });
  }

  // ─── Reminder & Worker Operations ────────────────────────────────────────────

  /**
   * Tìm các kỳ nợ T-3 chưa được nhắc (chỉ lấy status SCHEDULED để tránh gửi lặp)
   */
  async findScheduledReminderItems(t3Date: Date) {
    return prisma.debtScheduleItem.findMany({
      where: {
        dueDate: t3Date,
        status: 'SCHEDULED',
        debtContract: {
          status: 'ACTIVE',
          isArchived: false,
        },
      },
      include: {
        debtContract: true,
        user: {
          include: {
            notificationSetting: true,
          },
        },
      },
    });
  }

  /**
   * Tìm các kỳ nợ T-0 đến hạn hôm nay chưa chuyển sang DUE
   */
  async findDueReminderItems(todayDate: Date) {
    return prisma.debtScheduleItem.findMany({
      where: {
        dueDate: todayDate,
        status: { in: ['SCHEDULED', 'UPCOMING'] },
        debtContract: {
          status: 'ACTIVE',
          isArchived: false,
        },
      },
      include: {
        debtContract: true,
        user: {
          include: {
            notificationSetting: true,
          },
        },
      },
    });
  }

  /**
   * Tìm các kỳ nợ đã quá hạn nhưng chưa được đánh dấu OVERDUE
   */
  async findOverdueReminderItems(todayDate: Date) {
    return prisma.debtScheduleItem.findMany({
      where: {
        dueDate: { lt: todayDate },
        status: { in: ['SCHEDULED', 'UPCOMING', 'DUE'] },
        debtContract: {
          status: { in: ['ACTIVE', 'OVERDUE'] },
          isArchived: false,
        },
      },
      include: {
        debtContract: true,
        user: {
          include: {
            notificationSetting: true,
          },
        },
      },
    });
  }

  /**
   * Cập nhật trạng thái kỳ nợ
   */
  async updateScheduleItemStatus(id: string, status: DebtScheduleStatus) {
    return prisma.debtScheduleItem.update({
      where: { id },
      data: { status },
    });
  }

  /**
   * Cập nhật trạng thái hợp đồng nợ
   */
  async updateContractStatus(id: string, status: DebtStatus) {
    return prisma.debtContract.update({
      where: { id },
      data: { status },
    });
  }

  // ─── Zalo Bot Dedicated Operations ───────────────────────────────────────────

  /**
   * Tìm danh sách hợp đồng nợ đang hoạt động kèm 3 kỳ sắp đến hạn cho Bot Zalo
   */
  async findActiveDebtsForBot(userId: string) {
    return prisma.debtContract.findMany({
      where: {
        userId,
        isArchived: false,
        status: { in: ['ACTIVE', 'OVERDUE'] },
      },
      include: {
        scheduleItems: {
          where: {
            status: { in: ['SCHEDULED', 'UPCOMING', 'DUE', 'OVERDUE'] },
          },
          orderBy: { dueDate: 'asc' },
          take: 3,
        },
      },
    });
  }

  /**
   * Tìm kỳ nợ theo ID và userId phục vụ lệnh thanh toán 1-chạm /tra_no qua Bot Zalo
   */
  async findScheduleItemForPay(scheduleItemId: string, userId: string) {
    return prisma.debtScheduleItem.findFirst({
      where: { id: scheduleItemId, userId },
      include: { debtContract: true },
    });
  }
}
