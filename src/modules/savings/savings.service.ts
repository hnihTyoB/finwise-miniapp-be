import { Prisma, TermDepositRolloverMethod, TermDepositStatus } from '@prisma/client';
const Decimal = Prisma.Decimal;
import { prisma } from '../../database/prisma.client';
import { AppError } from '../../common/errors/app-error';
import { ERROR_CODE } from '../../common/errors/error-code';
import { cacheService } from '../../common/services/cache.service';
import {
  businessDateToPrismaDate,
  instantToBusinessDate,
  prismaDateToBusinessDate,
} from '../../common/date-time/business-time';
import {
  CreateTermDepositDto,
  SavingsSummaryDto,
  SettleTermDepositDto,
  TermDepositListResponseDto,
  TermDepositQueryDto,
  TermDepositResponseDto,
  UpdateTermDepositDto,
} from './savings.dto';
import { SavingsRepository } from './savings.repository';
import { SavingsCalculatorEngine } from './services/savings-calculator.engine';

export class SavingsService {
  private readonly repository = new SavingsRepository();

  async findAll(userId: string, query: TermDepositQueryDto): Promise<TermDepositListResponseDto> {
    const { items, total, page, limit, totalPages } = await this.repository.findAll(userId, query);

    const now = new Date();
    const todayStr = instantToBusinessDate(now);

    let totalPrincipal = new Decimal(0);
    let totalAccruedInterest = new Decimal(0);
    let totalEstimatedInterest = new Decimal(0);
    let activeCount = 0;
    let maturedCount = 0;
    let settledCount = 0;
    let dueSoonCount = 0;

    const formattedData: TermDepositResponseDto[] = items.map((item) => {
      const startDateStr = prismaDateToBusinessDate(item.startDate);
      const maturityDateStr = prismaDateToBusinessDate(item.maturityDate);

      const accrued = SavingsCalculatorEngine.calculateAccruedInterest(
        item.principalAmount.toString(),
        item.interestRate.toString(),
        startDateStr,
        maturityDateStr,
        todayStr,
      );

      const isDueSoon = item.status === TermDepositStatus.ACTIVE && accrued.remainingDays <= 3 && accrued.remainingDays >= 0;

      if (item.status === TermDepositStatus.ACTIVE) {
        activeCount += 1;
        totalPrincipal = totalPrincipal.add(item.principalAmount.toString());
        totalAccruedInterest = totalAccruedInterest.add(accrued.accruedInterest);
        totalEstimatedInterest = totalEstimatedInterest.add(item.estimatedInterest.toString());
        if (isDueSoon) dueSoonCount += 1;
      } else if (item.status === TermDepositStatus.MATURED) {
        maturedCount += 1;
        totalPrincipal = totalPrincipal.add(item.principalAmount.toString());
      } else {
        settledCount += 1;
      }

      return {
        id: item.id,
        userId: item.userId,
        walletId: item.walletId,
        walletName: item.wallet.name,
        bankName: item.bankName,
        accountNumber: item.accountNumber,
        principalAmount: item.principalAmount.toFixed(2),
        interestRate: item.interestRate.toFixed(2),
        termMonths: item.termMonths,
        startDate: startDateStr,
        maturityDate: maturityDateStr,
        rolloverMethod: item.rolloverMethod,
        targetWalletId: item.targetWalletId,
        targetWalletName: item.targetWallet?.name || null,
        status: item.status,
        estimatedInterest: item.estimatedInterest.toFixed(2),
        actualInterest: item.actualInterest ? item.actualInterest.toFixed(2) : null,
        nonTermRate: item.nonTermRate.toFixed(2),
        settledAt: item.settledAt,
        rolloverCount: item.rolloverCount,
        lastRolloverAt: item.lastRolloverAt,
        isReminderSentT3: item.isReminderSentT3,
        isReminderSentT0: item.isReminderSentT0,
        notes: item.notes,
        color: item.wallet.color,
        icon: item.wallet.icon,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        accrued,
        isDueSoon,
        rolloverLogs: item.rolloverLogs?.map((log) => ({
          id: log.id,
          cycleNumber: log.cycleNumber,
          startDate: prismaDateToBusinessDate(log.startDate),
          endDate: prismaDateToBusinessDate(log.endDate),
          principal: log.principal.toFixed(2),
          interestEarned: log.interestEarned.toFixed(2),
          actionTaken: log.actionTaken,
          createdAt: log.createdAt,
        })),
      };
    });

    const summary: SavingsSummaryDto = {
      totalPrincipal: totalPrincipal.toFixed(2),
      totalAccruedInterest: totalAccruedInterest.toFixed(2),
      totalEstimatedInterest: totalEstimatedInterest.toFixed(2),
      activeCount,
      maturedCount,
      settledCount,
      dueSoonCount,
    };

    return {
      data: formattedData,
      summary,
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }

  async findById(userId: string, id: string): Promise<TermDepositResponseDto> {
    const item = await this.repository.findById(userId, id);
    if (!item) {
      throw new AppError('Sổ tiết kiệm không tồn tại', 404, ERROR_CODE.TERM_DEPOSIT_NOT_FOUND);
    }

    const startDateStr = prismaDateToBusinessDate(item.startDate);
    const maturityDateStr = prismaDateToBusinessDate(item.maturityDate);
    const todayStr = instantToBusinessDate(new Date());

    const accrued = SavingsCalculatorEngine.calculateAccruedInterest(
      item.principalAmount.toString(),
      item.interestRate.toString(),
      startDateStr,
      maturityDateStr,
      todayStr,
    );

    const isDueSoon = item.status === TermDepositStatus.ACTIVE && accrued.remainingDays <= 3 && accrued.remainingDays >= 0;

    return {
      id: item.id,
      userId: item.userId,
      walletId: item.walletId,
      walletName: item.wallet.name,
      bankName: item.bankName,
      accountNumber: item.accountNumber,
      principalAmount: item.principalAmount.toFixed(2),
      interestRate: item.interestRate.toFixed(2),
      termMonths: item.termMonths,
      startDate: startDateStr,
      maturityDate: maturityDateStr,
      rolloverMethod: item.rolloverMethod,
      targetWalletId: item.targetWalletId,
      targetWalletName: item.targetWallet?.name || null,
      status: item.status,
      estimatedInterest: item.estimatedInterest.toFixed(2),
      actualInterest: item.actualInterest ? item.actualInterest.toFixed(2) : null,
      nonTermRate: item.nonTermRate.toFixed(2),
      settledAt: item.settledAt,
      rolloverCount: item.rolloverCount,
      lastRolloverAt: item.lastRolloverAt,
      isReminderSentT3: item.isReminderSentT3,
      isReminderSentT0: item.isReminderSentT0,
      notes: item.notes,
      color: item.wallet.color,
      icon: item.wallet.icon,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      accrued,
      isDueSoon,
      rolloverLogs: item.rolloverLogs?.map((log) => ({
        id: log.id,
        cycleNumber: log.cycleNumber,
        startDate: prismaDateToBusinessDate(log.startDate),
        endDate: prismaDateToBusinessDate(log.endDate),
        principal: log.principal.toFixed(2),
        interestEarned: log.interestEarned.toFixed(2),
        actionTaken: log.actionTaken,
        createdAt: log.createdAt,
      })),
    };
  }

  async create(userId: string, data: CreateTermDepositDto): Promise<TermDepositResponseDto> {
    const startDateStr = data.startDate || instantToBusinessDate(new Date());
    const maturityDateStr = SavingsCalculatorEngine.calculateMaturityDate(startDateStr, data.termMonths);
    const actualDays = SavingsCalculatorEngine.calculateActualDays(startDateStr, maturityDateStr);

    const principalDecimal = new Prisma.Decimal(data.principalAmount);
    const interestRateDecimal = new Prisma.Decimal(data.interestRate);
    const nonTermRateDecimal = new Prisma.Decimal(data.nonTermRate || '0.20');

    const estimatedInterest = SavingsCalculatorEngine.calculateTermInterest(
      principalDecimal.toString(),
      interestRateDecimal.toString(),
      actualDays,
    );

    if (data.targetWalletId) {
      const targetWallet = await prisma.wallet.findFirst({
        where: { id: data.targetWalletId, userId, isArchived: false },
      });
      if (!targetWallet) {
        throw new AppError('Ví nhận tiền không tồn tại hoặc đã bị lưu trữ', 400, ERROR_CODE.NOT_FOUND);
      }
    }

    if (data.sourceWalletId) {
      const sourceWallet = await prisma.wallet.findFirst({
        where: { id: data.sourceWalletId, userId, isArchived: false },
      });
      if (!sourceWallet) {
        throw new AppError('Ví nguồn không tồn tại hoặc đã bị lưu trữ', 400, ERROR_CODE.NOT_FOUND);
      }
      if (sourceWallet.type === 'SAVINGS_ACCOUNT') {
        throw new AppError('Không thể trích tiền từ ví sổ tiết kiệm khác', 409, ERROR_CODE.WALLET_SAVINGS_LOCKED);
      }
    }

    const created = await this.repository.createWithWalletAtomic(
      userId,
      {
        bankName: data.bankName,
        accountNumber: data.accountNumber,
        principalAmount: principalDecimal,
        interestRate: interestRateDecimal,
        termMonths: data.termMonths,
        startDate: businessDateToPrismaDate(startDateStr),
        maturityDate: businessDateToPrismaDate(maturityDateStr),
        rolloverMethod: data.rolloverMethod || TermDepositRolloverMethod.ROLLOVER_ALL,
        targetWalletId: data.targetWalletId,
        estimatedInterest: new Prisma.Decimal(estimatedInterest.toString()),
        nonTermRate: nonTermRateDecimal,
        notes: data.notes,
      },
      {
        name: data.name,
        color: data.color || '#3B82F6',
        icon: data.icon || 'savings',
      },
      data.sourceWalletId,
    );

    await this.invalidateCache(userId);
    return this.findById(userId, created.id);
  }

  async update(userId: string, id: string, data: UpdateTermDepositDto): Promise<TermDepositResponseDto> {
    const existing = await this.repository.findById(userId, id);
    if (!existing) {
      throw new AppError('Sổ tiết kiệm không tồn tại', 404, ERROR_CODE.TERM_DEPOSIT_NOT_FOUND);
    }

    if (existing.status === TermDepositStatus.SETTLED || existing.status === TermDepositStatus.EARLY_WITHDRAWN) {
      throw new AppError('Không thể chỉnh sửa sổ tiết kiệm đã tất toán', 409, ERROR_CODE.TERM_DEPOSIT_ALREADY_SETTLED);
    }

    if (data.targetWalletId) {
      const targetWallet = await prisma.wallet.findFirst({
        where: { id: data.targetWalletId, userId, isArchived: false },
      });
      if (!targetWallet) {
        throw new AppError('Ví nhận tiền không tồn tại hoặc đã bị lưu trữ', 400, ERROR_CODE.NOT_FOUND);
      }
      if (targetWallet.id === existing.walletId) {
        throw new AppError('Ví nhận tiền không được trùng với chính ví sổ tiết kiệm', 409, ERROR_CODE.VALIDATION_ERROR);
      }
    }

    const updateData: Prisma.TermDepositUpdateInput = {};

    if (data.bankName !== undefined) updateData.bankName = data.bankName;
    if (data.accountNumber !== undefined) updateData.accountNumber = data.accountNumber;
    if (data.rolloverMethod !== undefined) updateData.rolloverMethod = data.rolloverMethod;
    if (data.targetWalletId !== undefined) {
      updateData.targetWallet = data.targetWalletId ? { connect: { id: data.targetWalletId } } : { disconnect: true };
    }
    if (data.nonTermRate !== undefined) updateData.nonTermRate = new Prisma.Decimal(data.nonTermRate);
    if (data.notes !== undefined) updateData.notes = data.notes;

    if (data.interestRate !== undefined) {
      const newRate = new Prisma.Decimal(data.interestRate);
      updateData.interestRate = newRate;
      const startDateStr = prismaDateToBusinessDate(existing.startDate);
      const maturityDateStr = prismaDateToBusinessDate(existing.maturityDate);
      const actualDays = SavingsCalculatorEngine.calculateActualDays(startDateStr, maturityDateStr);
      const newEstimatedInterest = SavingsCalculatorEngine.calculateTermInterest(
        existing.principalAmount.toString(),
        newRate.toString(),
        actualDays,
      );
      updateData.estimatedInterest = new Prisma.Decimal(newEstimatedInterest.toString());
    }

    if (data.name !== undefined || data.color !== undefined || data.icon !== undefined) {
      updateData.wallet = {
        update: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.color !== undefined ? { color: data.color } : {}),
          ...(data.icon !== undefined ? { icon: data.icon } : {}),
        },
      };
    }

    await this.repository.update(id, updateData, undefined, userId);
    await this.invalidateCache(userId);

    return this.findById(userId, id);
  }

  async settle(userId: string, id: string, data: SettleTermDepositDto): Promise<TermDepositResponseDto> {
    const existing = await this.repository.findById(userId, id);
    if (!existing) {
      throw new AppError('Sổ tiết kiệm không tồn tại', 404, ERROR_CODE.TERM_DEPOSIT_NOT_FOUND);
    }

    if (existing.status === TermDepositStatus.SETTLED || existing.status === TermDepositStatus.EARLY_WITHDRAWN) {
      throw new AppError('Sổ tiết kiệm đã được tất toán', 409, ERROR_CODE.TERM_DEPOSIT_ALREADY_SETTLED);
    }

    if (data.targetWalletId === existing.walletId) {
      throw new AppError('Ví nhận tiền tất toán không được là chính ví sổ tiết kiệm', 409, ERROR_CODE.VALIDATION_ERROR);
    }

    const targetWallet = await prisma.wallet.findFirst({
      where: { id: data.targetWalletId, userId, isArchived: false },
    });
    if (!targetWallet) {
      throw new AppError('Ví nhận tiền không tồn tại hoặc đã bị lưu trữ', 400, ERROR_CODE.NOT_FOUND);
    }

    const todayStr = data.settlementDate || instantToBusinessDate(new Date());
    const maturityDateStr = prismaDateToBusinessDate(existing.maturityDate);
    const startDateStr = prismaDateToBusinessDate(existing.startDate);

    // Xác định xem có phải rút trước hạn không
    const isEarly = data.isEarlyWithdrawal || todayStr < maturityDateStr;

    let interestEarned: Prisma.Decimal;

    if (isEarly) {
      // Rút trước hạn: Tính theo lãi suất không kỳ hạn
      const earlyCalc = SavingsCalculatorEngine.calculateEarlyWithdrawal(
        existing.principalAmount.toString(),
        existing.interestRate.toString(),
        existing.nonTermRate.toString(),
        startDateStr,
        maturityDateStr,
        todayStr,
      );
      interestEarned = new Prisma.Decimal(earlyCalc.actualInterestReceived);
    } else {
      // Tất toán đúng hạn: Lấy đủ lãi ước tính
      interestEarned = existing.estimatedInterest;
    }

    await this.repository.executeSettlementAtomic(
      userId,
      id,
      data.targetWalletId,
      existing.principalAmount,
      interestEarned,
      isEarly,
      data.notes,
    );

    await this.invalidateCache(userId);
    return this.findById(userId, id);
  }

  preview(principal: string, rate: string, termMonths: number, startDate?: string) {
    return SavingsCalculatorEngine.previewTermDeposit(principal, rate, termMonths, startDate);
  }

  async previewEarlyWithdrawal(userId: string, id: string, withdrawalDateStr?: string) {
    const deposit = await this.findById(userId, id);
    return SavingsCalculatorEngine.calculateEarlyWithdrawal(
      deposit.principalAmount,
      deposit.interestRate,
      deposit.nonTermRate,
      deposit.startDate,
      deposit.maturityDate,
      withdrawalDateStr,
    );
  }

  private async invalidateCache(userId: string) {
    await cacheService.clearPattern(`finwise:cache:reports:${userId}:*`);
    await cacheService.clearPattern(`finwise:cache:wallets:${userId}:*`);
    await cacheService.clearPattern(`finwise:cache:forecast:${userId}:*`);
  }
}
