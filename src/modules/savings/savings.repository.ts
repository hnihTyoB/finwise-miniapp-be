import { Prisma, TermDepositRolloverMethod, TermDepositStatus, WalletType } from '@prisma/client';
import { prisma } from '../../database/prisma.client';
import { TermDepositQueryDto } from './savings.dto';

export type RepositoryTransaction = Prisma.TransactionClient;

export class SavingsRepository {
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

  async getOrCreateInterestCategory(userId: string): Promise<string> {
    const existing = await prisma.category.findFirst({
      where: {
        OR: [
          { userId, name: 'Lãi tiết kiệm', type: 'INCOME' },
          { isSystem: true, name: 'Lãi tiết kiệm', type: 'INCOME' },
          { isSystem: true, name: 'Thu nhập đầu tư', type: 'INCOME' },
        ],
      },
      select: { id: true },
    });

    if (existing) return existing.id;

    const created = await prisma.category.create({
      data: {
        userId,
        name: 'Lãi tiết kiệm',
        type: 'INCOME',
        icon: 'savings',
        color: '#10B981',
        isSystem: false,
      },
      select: { id: true },
    });

    return created.id;
  }

  async findAll(userId: string, query: TermDepositQueryDto) {
    const where: Prisma.TermDepositWhereInput = {
      userId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { bankName: { contains: query.search, mode: 'insensitive' } },
              { wallet: { name: { contains: query.search, mode: 'insensitive' } } },
              { accountNumber: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      prisma.termDeposit.findMany({
        where,
        include: {
          wallet: true,
          targetWallet: true,
          rolloverLogs: {
            orderBy: { cycleNumber: 'desc' },
            take: 5,
          },
        },
        orderBy: {
          [query.sortBy || 'createdAt']: query.order || 'desc',
        },
        skip,
        take: limit,
      }),
      prisma.termDeposit.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async findById(userId: string, id: string, client: RepositoryTransaction | typeof prisma = prisma) {
    return client.termDeposit.findFirst({
      where: { id, userId },
      include: {
        wallet: true,
        targetWallet: true,
        rolloverLogs: {
          orderBy: { cycleNumber: 'desc' },
        },
      },
    });
  }

  async findByWalletId(walletId: string, client: RepositoryTransaction | typeof prisma = prisma) {
    return client.termDeposit.findUnique({
      where: { walletId },
      include: {
        wallet: true,
        targetWallet: true,
      },
    });
  }

  async createWithWalletAtomic(
    userId: string,
    depositData: {
      bankName: string;
      accountNumber?: string;
      principalAmount: Prisma.Decimal;
      interestRate: Prisma.Decimal;
      termMonths: number;
      startDate: Date;
      maturityDate: Date;
      rolloverMethod: TermDepositRolloverMethod;
      targetWalletId?: string;
      estimatedInterest: Prisma.Decimal;
      nonTermRate: Prisma.Decimal;
      notes?: string;
    },
    walletData: {
      name: string;
      color?: string;
      icon?: string;
    },
    sourceWalletId?: string,
  ) {
    return this.runSerializable(async (tx) => {
      // 1. Tạo ví chuyên biệt SAVINGS_ACCOUNT
      const savingsWallet = await tx.wallet.create({
        data: {
          userId,
          name: walletData.name,
          balance: depositData.principalAmount,
          currency: 'VND',
          type: WalletType.SAVINGS_ACCOUNT,
          color: walletData.color || '#3B82F6',
          icon: walletData.icon || 'savings',
          description: `Sổ tiết kiệm ${depositData.bankName} - Kỳ hạn ${depositData.termMonths} tháng`,
          isDefault: false,
          isArchived: false,
        },
      });

      // 2. Nếu có ví nguồn trích tiền -> trừ tiền ví nguồn và ghi nhận Transfer
      if (sourceWalletId) {
        const sourceWallet = await tx.wallet.findFirst({
          where: { id: sourceWalletId, userId },
        });

        if (!sourceWallet) {
          throw new Error('Ví nguồn không tồn tại');
        }

        if (sourceWallet.isArchived) {
          throw new Error('Ví nguồn đã bị lưu trữ');
        }

        if (sourceWallet.balance.lessThan(depositData.principalAmount)) {
          throw new Error('Số dư ví nguồn không đủ để gửi tiết kiệm');
        }

        // Trừ tiền ví nguồn
        await tx.wallet.update({
          where: { id: sourceWalletId },
          data: {
            balance: { decrement: depositData.principalAmount },
          },
        });

        // Tạo Transfer giữa ví nguồn và ví tiết kiệm (không tính vào Expense)
        await tx.transfer.create({
          data: {
            userId,
            sourceWalletId,
            destinationWalletId: savingsWallet.id,
            amount: depositData.principalAmount,
            note: `Mở sổ tiết kiệm: ${depositData.bankName} (${walletData.name})`,
            transferredAt: new Date(),
          },
        });
      }

      // 3. Tạo TermDeposit
      const termDeposit = await tx.termDeposit.create({
        data: {
          userId,
          walletId: savingsWallet.id,
          bankName: depositData.bankName,
          accountNumber: depositData.accountNumber,
          principalAmount: depositData.principalAmount,
          interestRate: depositData.interestRate,
          termMonths: depositData.termMonths,
          startDate: depositData.startDate,
          maturityDate: depositData.maturityDate,
          rolloverMethod: depositData.rolloverMethod,
          targetWalletId: depositData.targetWalletId,
          status: TermDepositStatus.ACTIVE,
          estimatedInterest: depositData.estimatedInterest,
          nonTermRate: depositData.nonTermRate,
          notes: depositData.notes,
        },
        include: {
          wallet: true,
          targetWallet: true,
        },
      });

      return termDeposit;
    });
  }

  async update(
    id: string,
    data: Prisma.TermDepositUpdateInput,
    client: RepositoryTransaction | typeof prisma = prisma,
    userId?: string,
  ) {
    if (userId) {
      const existing = await client.termDeposit.findFirst({
        where: { id, userId },
        select: { id: true },
      });
      if (!existing) {
        throw new Error('Sổ tiết kiệm không tồn tại hoặc không có quyền truy cập');
      }
    }

    return client.termDeposit.update({
      where: { id },
      data,
      include: {
        wallet: true,
        targetWallet: true,
      },
    });
  }

  async executeSettlementAtomic(
    userId: string,
    termDepositId: string,
    targetWalletId: string,
    principal: Prisma.Decimal,
    interest: Prisma.Decimal,
    isEarly: boolean,
    notes?: string,
  ) {
    const interestCategoryId = interest.greaterThan(0)
      ? await this.getOrCreateInterestCategory(userId)
      : null;

    return this.runSerializable(async (tx) => {
      const deposit = await tx.termDeposit.findFirst({
        where: { id: termDepositId, userId },
        include: { wallet: true },
      });

      if (!deposit) {
        throw new Error('Sổ tiết kiệm không tồn tại');
      }

      if (deposit.status === TermDepositStatus.SETTLED || deposit.status === TermDepositStatus.EARLY_WITHDRAWN) {
        throw new Error('Sổ tiết kiệm đã được tất toán trước đó');
      }

      if (targetWalletId === deposit.walletId) {
        throw new Error('Ví nhận tiền tất toán không được là chính ví sổ tiết kiệm');
      }

      const targetWallet = await tx.wallet.findFirst({
        where: { id: targetWalletId, userId },
      });

      if (!targetWallet) {
        throw new Error('Ví nhận tiền không tồn tại');
      }

      if (targetWallet.isArchived) {
        throw new Error('Ví nhận tiền đã bị lưu trữ');
      }

      const totalReturn = principal.add(interest);

      // 1. Chuyển tiền gốc về ví đích (qua Transfer để bảo toàn luồng vốn)
      await tx.transfer.create({
        data: {
          userId,
          sourceWalletId: deposit.walletId,
          destinationWalletId: targetWalletId,
          amount: principal,
          note: `Tất toán gốc sổ tiết kiệm: ${deposit.wallet.name}`,
          transferredAt: new Date(),
        },
      });

      // 2. Ghi nhận tiền lãi như một khoản INCOME vào ví đích
      if (interest.greaterThan(0) && interestCategoryId) {
        await tx.transaction.create({
          data: {
            userId,
            walletId: targetWalletId,
            categoryId: interestCategoryId,
            amount: interest,
            type: 'INCOME',
            description: `Tiền lãi tất toán sổ tiết kiệm: ${deposit.wallet.name} (${deposit.bankName})`,
            date: new Date(),
          },
        });
      }

      // 3. Cập nhật số dư các ví
      // Ví đích nhận: Principal + Interest
      await tx.wallet.update({
        where: { id: targetWalletId },
        data: {
          balance: { increment: totalReturn },
        },
      });

      // Ví tiết kiệm: Balance về 0 và lưu trữ
      await tx.wallet.update({
        where: { id: deposit.walletId },
        data: {
          balance: new Prisma.Decimal(0),
          isArchived: true,
        },
      });

      // 4. Cập nhật TermDeposit
      const updatedDeposit = await tx.termDeposit.update({
        where: { id: termDepositId },
        data: {
          status: isEarly ? TermDepositStatus.EARLY_WITHDRAWN : TermDepositStatus.SETTLED,
          actualInterest: interest,
          settledAt: new Date(),
          notes: notes ? `${deposit.notes ? deposit.notes + '\n' : ''}${notes}` : deposit.notes,
        },
        include: {
          wallet: true,
          targetWallet: true,
        },
      });

      // 5. Ghi log chu kỳ
      await tx.termDepositRolloverLog.create({
        data: {
          termDepositId,
          cycleNumber: deposit.rolloverCount + 1,
          startDate: deposit.startDate,
          endDate: deposit.maturityDate,
          principal,
          interestEarned: interest,
          actionTaken: TermDepositRolloverMethod.SETTLE_TO_WALLET,
        },
      });

      return updatedDeposit;
    });
  }

  async executeRolloverAtomic(
    depositId: string,
    rolloverMethod: TermDepositRolloverMethod,
    newStartDate: Date,
    newMaturityDate: Date,
    newPrincipal: Prisma.Decimal,
    cycleInterest: Prisma.Decimal,
    newEstimatedInterest: Prisma.Decimal,
  ) {
    const existingDeposit = await prisma.termDeposit.findUnique({
      where: { id: depositId },
      select: { userId: true },
    });

    const interestCategoryId =
      existingDeposit && cycleInterest.greaterThan(0)
        ? await this.getOrCreateInterestCategory(existingDeposit.userId)
        : null;

    return this.runSerializable(async (tx) => {
      const deposit = await tx.termDeposit.findUnique({
        where: { id: depositId },
        include: { wallet: true },
      });

      if (!deposit) throw new Error('Sổ tiết kiệm không tồn tại');

      const nextCycle = deposit.rolloverCount + 1;

      // Ghi log chu kỳ vừa kết thúc
      await tx.termDepositRolloverLog.create({
        data: {
          termDepositId: depositId,
          cycleNumber: nextCycle,
          startDate: deposit.startDate,
          endDate: deposit.maturityDate,
          principal: deposit.principalAmount,
          interestEarned: cycleInterest,
          actionTaken: rolloverMethod,
        },
      });

      if (rolloverMethod === TermDepositRolloverMethod.ROLLOVER_ALL) {
        // Tái tục gốc + lãi: Balance ví tiết kiệm tăng lên thành newPrincipal
        await tx.wallet.update({
          where: { id: deposit.walletId },
          data: { balance: newPrincipal },
        });

        return tx.termDeposit.update({
          where: { id: depositId },
          data: {
            principalAmount: newPrincipal,
            startDate: newStartDate,
            maturityDate: newMaturityDate,
            estimatedInterest: newEstimatedInterest,
            rolloverCount: nextCycle,
            lastRolloverAt: new Date(),
            isReminderSentT3: false,
            isReminderSentT0: false,
          },
          include: { wallet: true, targetWallet: true },
        });
      } else if (rolloverMethod === TermDepositRolloverMethod.ROLLOVER_PRINCIPAL) {
        // Tái tục gốc, nhận lãi về ví đích
        const targetWalletId = deposit.targetWalletId;
        if (targetWalletId && cycleInterest.greaterThan(0) && interestCategoryId) {
          // Cộng tiền lãi vào ví đích
          await tx.wallet.update({
            where: { id: targetWalletId },
            data: { balance: { increment: cycleInterest } },
          });

          await tx.transaction.create({
            data: {
              userId: deposit.userId,
              walletId: targetWalletId,
              categoryId: interestCategoryId,
              amount: cycleInterest,
              type: 'INCOME',
              description: `Nhận lãi kỳ ${nextCycle} sổ tiết kiệm: ${deposit.wallet.name}`,
              date: new Date(),
            },
          });
        } else if (!targetWalletId && cycleInterest.greaterThan(0)) {
          // Phòng ngừa mất tiền: nếu ví đích không có, tự động nhập lãi vào gốc chu kỳ mới
          const fallbackPrincipal = newPrincipal.add(cycleInterest);
          await tx.wallet.update({
            where: { id: deposit.walletId },
            data: { balance: fallbackPrincipal },
          });

          return tx.termDeposit.update({
            where: { id: depositId },
            data: {
              principalAmount: fallbackPrincipal,
              startDate: newStartDate,
              maturityDate: newMaturityDate,
              estimatedInterest: newEstimatedInterest,
              rolloverCount: nextCycle,
              lastRolloverAt: new Date(),
              isReminderSentT3: false,
              isReminderSentT0: false,
            },
            include: { wallet: true, targetWallet: true },
          });
        }

        return tx.termDeposit.update({
          where: { id: depositId },
          data: {
            startDate: newStartDate,
            maturityDate: newMaturityDate,
            estimatedInterest: newEstimatedInterest,
            rolloverCount: nextCycle,
            lastRolloverAt: new Date(),
            isReminderSentT3: false,
            isReminderSentT0: false,
          },
          include: { wallet: true, targetWallet: true },
        });
      }

      throw new Error(`Unsupported rollover method: ${rolloverMethod}`);
    });
  }

  async findDueReminderDeposits(t3Date: Date, todayDate?: Date) {
    return prisma.termDeposit.findMany({
      where: {
        status: TermDepositStatus.ACTIVE,
        maturityDate: todayDate ? { lte: t3Date, gt: todayDate } : t3Date,
        isReminderSentT3: false,
      },
      include: {
        wallet: true,
        user: true,
      },
    });
  }

  async findDueMaturityDeposits(todayDate: Date) {
    return prisma.termDeposit.findMany({
      where: {
        status: TermDepositStatus.ACTIVE,
        maturityDate: { lte: todayDate },
        isReminderSentT0: false,
      },
      include: {
        wallet: true,
        user: true,
      },
    });
  }

  async markReminderSent(id: string, type: 'T3' | 'T0') {
    return prisma.termDeposit.update({
      where: { id },
      data: type === 'T3' ? { isReminderSentT3: true } : { isReminderSentT0: true },
    });
  }
}
