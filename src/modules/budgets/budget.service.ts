import { uuidv7 } from '../../common/helpers/uuid.helper';
import {
  BudgetPeriod,
  BudgetRolloverMode,
  BudgetType,
  NotificationPriority,
  NotificationSourceType,
  NotificationType,
  Prisma,
  TransactionType,
} from '@prisma/client';
import { AppError } from '../../common/errors/app-error';
import { ERROR_CODE } from '../../common/errors/error-code';
import { cacheService } from '../../common/services/cache.service';
import {
  addBusinessDays,
  addBusinessMonthsClamped,
  BusinessDate,
  instantToBusinessDate,
  prismaDateToBusinessDate,
} from '../../common/date-time/business-time';
import {
  BudgetQueryDto,
  BudgetResponseDto,
  BudgetTimeStatus,
  BudgetUsageStatus,
  CreateBudgetDto,
  PersistBudgetDto,
  UpdateBudgetDto,
} from './budget.dto';
import {
  BudgetRecord,
  BudgetRepository,
  BudgetSpendingSummary,
} from './budget.repository';
import { NotificationService } from '../notifications/notification.service';

export class BudgetService {
  private readonly repository = new BudgetRepository();
  private readonly notificationService = new NotificationService();

  async findAll(userId: string, query: BudgetQueryDto) {
    const result = await this.repository.findAll(userId, query);
    const summaries = await this.repository.getBatchSpendingSummaries(
      userId,
      result.data,
    );
    const data = result.data.map((budget) => {
      const spending = summaries.get(budget.id) ?? {
        amount: new Prisma.Decimal(0),
        transactionCount: 0,
        lastTransactionAt: null,
      };
      return this.formatBudgetResponse(budget, spending);
    });

    return { data, meta: result.meta };
  }

  async findById(userId: string, id: string) {
    const budget = await this.findRecord(userId, id);
    return this.toResponse(userId, budget);
  }

  async findSeries(userId: string, id: string) {
    const budget = await this.findRecord(userId, id);
    if (!budget.recurrenceGroupId) {
      return [await this.toResponse(userId, budget)];
    }
    const series = await this.repository.findSeries(
      userId,
      budget.recurrenceGroupId,
    );
    const summaries = await this.repository.getBatchSpendingSummaries(
      userId,
      series,
    );
    return series.map((b) => {
      const spending = summaries.get(b.id) ?? {
        amount: new Prisma.Decimal(0),
        transactionCount: 0,
        lastTransactionAt: null,
      };
      return this.formatBudgetResponse(b, spending);
    });
  }

  async create(userId: string, data: CreateBudgetDto) {
    const persistence = await this.resolveCreateData(userId, data);
    const budget = await this.repository.create(userId, persistence);
    await this.invalidateReportCache(userId);
    return this.toResponse(userId, budget);
  }

  async update(userId: string, id: string, data: UpdateBudgetDto) {
    const current = await this.findRecord(userId, id);

    if (current.isArchived) {
      throw new AppError(
        'Restore the budget before updating it',
        409,
        ERROR_CODE.BUDGET_ARCHIVED,
      );
    }

    const persistence = await this.resolveUpdateData(userId, current, data);
    const budget = await this.repository.update(id, persistence);
    await this.invalidateReportCache(userId);
    return this.toResponse(userId, budget);
  }

  async toggleAutoRenew(userId: string, id: string, autoRenew: boolean) {
    const budget = await this.findRecord(userId, id);
    if (!budget.isRecurring) {
      throw new AppError(
        'Cannot toggle auto-renew on a non-recurring budget',
        400,
        ERROR_CODE.VALIDATION_ERROR,
      );
    }
    const updated = await this.repository.updateAutoRenew(userId, id, autoRenew);
    await this.invalidateReportCache(userId);
    return this.toResponse(userId, updated);
  }

  async archive(userId: string, id: string) {
    const current = await this.findRecord(userId, id);
    const budget = current.isArchived
      ? current
      : await this.repository.archive(id);

    await this.invalidateReportCache(userId);
    return this.toResponse(userId, budget);
  }

  async restore(userId: string, id: string) {
    const current = await this.findRecord(userId, id);

    if (!current.isArchived) {
      return this.toResponse(userId, current);
    }

    if (current.categoryId) {
      await this.ensureExpenseCategory(userId, current.categoryId);
    }

    const budget = await this.repository.restore(id);
    await this.invalidateReportCache(userId);
    return this.toResponse(userId, budget);
  }

  async processDueRenewals(now = new Date()): Promise<number> {
    const today = instantToBusinessDate(now);
    const dueBudgets = await this.repository.findDueForRenewal(today, 50);
    let renewedCount = 0;

    for (const parent of dueBudgets) {
      try {
        let currentParent: BudgetRecord | null = parent;
        let iteration = 0;
        while (currentParent && iteration < 3) {
          iteration++;
          const currentParentEndDate = prismaDateToBusinessDate(
            currentParent.endDate,
          );
          if (currentParentEndDate >= today) break;

          const nextStartDate = addBusinessDays(currentParentEndDate, 1);
          if (
            currentParent.autoRenewUntil &&
            nextStartDate >
              prismaDateToBusinessDate(currentParent.autoRenewUntil)
          ) {
            break;
          }

          const child = await this.renewSingleBudget(currentParent, today);
          if (child) {
            renewedCount++;
            currentParent = child;
          } else {
            break;
          }
        }
      } catch (error) {
        console.error(`Failed to renew budget ${parent.id}:`, error);
      }
    }

    return renewedCount;
  }

  private async catchUpDueBudgetsForUser(
    userId: string,
    today: BusinessDate,
  ): Promise<void> {
    try {
      const dueBudgets = await this.repository.findDueForRenewalByUser(
        userId,
        today,
      );
      for (const parent of dueBudgets) {
        let currentParent: BudgetRecord | null = parent;
        let iteration = 0;
        while (currentParent && iteration < 3) {
          iteration++;
          const currentParentEndDate = prismaDateToBusinessDate(
            currentParent.endDate,
          );
          if (currentParentEndDate >= today) break;

          const nextStartDate = addBusinessDays(currentParentEndDate, 1);
          if (
            currentParent.autoRenewUntil &&
            nextStartDate >
              prismaDateToBusinessDate(currentParent.autoRenewUntil)
          ) {
            break;
          }

          const child = await this.renewSingleBudget(currentParent, today);
          if (child) {
            currentParent = child;
          } else {
            break;
          }
        }
      }
    } catch (error) {
      console.error(`Failed to catch-up budgets for user ${userId}:`, error);
    }
  }

  private async renewSingleBudget(
    parentBudget: BudgetRecord,
    today: BusinessDate,
  ): Promise<BudgetRecord | null> {
    // 1. Verify category is still active if category budget
    if (parentBudget.categoryId) {
      const category = await this.repository.findCategory(
        parentBudget.userId,
        parentBudget.categoryId,
      );
      if (!category || category.isArchived) {
        await this.repository.updateAutoRenew(
          parentBudget.userId,
          parentBudget.id,
          false,
        );
        await this.notificationService.create({
          userId: parentBudget.userId,
          type: NotificationType.SYSTEM,
          priority: NotificationPriority.HIGH,
          title: 'Tự động gia hạn ngân sách bị tạm dừng',
          message: `Ngân sách "${parentBudget.name}" không thể tự động gia hạn vì danh mục chi tiêu đã bị lưu trữ hoặc xóa.`,
          sourceType: NotificationSourceType.SYSTEM,
          sourceId: parentBudget.id,
          actionUrl: `/budgets/${parentBudget.id}`,
          data: { budgetId: parentBudget.id, reason: 'CATEGORY_ARCHIVED' },
          dedupKey: `budget-renew-failed:${parentBudget.id}:${today}`,
        });
        return null;
      }
    }

    // 2. Compute date boundaries
    const parentEndDate = prismaDateToBusinessDate(parentBudget.endDate);
    const newStartDate = addBusinessDays(parentEndDate, 1);
    const newEndDate = this.resolveEndDate(parentBudget.period, newStartDate);

    // 3. Compute new amount based on rollover policy
    const spending = await this.repository.getSpendingSummary(
      parentBudget.userId,
      parentBudget.categoryId,
      parentBudget.startDate,
      parentBudget.endDate,
      parentBudget.currency,
    );
    const remaining = parentBudget.amount.minus(spending.amount);
    const baseAmount = parentBudget.amount;
    let newAmount = baseAmount;
    let rolloverAmount = new Prisma.Decimal(0);

    switch (parentBudget.rolloverMode) {
      case BudgetRolloverMode.ROLLOVER_SURPLUS:
        if (remaining.greaterThan(0)) {
          newAmount = baseAmount.plus(remaining);
          rolloverAmount = remaining;
        }
        break;
      case BudgetRolloverMode.ROLLOVER_DEFICIT:
        if (remaining.lessThan(0)) {
          newAmount = Prisma.Decimal.max(
            new Prisma.Decimal(0),
            baseAmount.plus(remaining),
          );
          rolloverAmount = remaining;
        }
        break;
      case BudgetRolloverMode.ROLLOVER_NET:
        newAmount = Prisma.Decimal.max(
          new Prisma.Decimal(0),
          baseAmount.plus(remaining),
        );
        rolloverAmount = remaining;
        break;
      case BudgetRolloverMode.RESET:
      default:
        newAmount = baseAmount;
        rolloverAmount = new Prisma.Decimal(0);
        break;
    }

    // 4. Update name dynamically if pattern "tháng X" or "month X" exists
    let newName = parentBudget.name;
    const newMonth = parseInt(newStartDate.slice(5, 7), 10);
    if (/(tháng\s*)\d+/i.test(newName)) {
      newName = newName.replace(/(tháng\s*)\d+/i, `$1${newMonth}`);
    } else if (/(month\s*)\d+/i.test(newName)) {
      newName = newName.replace(/(month\s*)\d+/i, `$1${newMonth}`);
    }

    // 5. Build persist data
    const persistData: PersistBudgetDto = {
      name: newName,
      amount: newAmount.toFixed(2),
      currency: parentBudget.currency,
      type: parentBudget.type,
      period: parentBudget.period,
      categoryId: parentBudget.categoryId,
      startDate: newStartDate,
      endDate: newEndDate,
      alertThreshold: parentBudget.alertThreshold.toFixed(2),
      isRecurring: true,
      autoRenew: true,
      recurrenceGroupId: parentBudget.recurrenceGroupId,
      rolloverMode: parentBudget.rolloverMode,
      rolloverAmount: rolloverAmount.toFixed(2),
      autoRenewUntil: parentBudget.autoRenewUntil
        ? prismaDateToBusinessDate(parentBudget.autoRenewUntil)
        : null,
      parentBudgetId: parentBudget.id,
    };

    const newBudget = await this.repository.renewBudgetTransaction(
      parentBudget,
      persistData,
    );

    // 6. Send in-app notification
    await this.notificationService.create({
      userId: newBudget.userId,
      type: NotificationType.SYSTEM,
      priority: NotificationPriority.NORMAL,
      title: 'Ngân sách chu kỳ mới đã sẵn sàng',
      message: `Ngân sách "${newBudget.name}" đã được tự động kích hoạt cho chu kỳ tiếp theo (${newStartDate} đến ${newEndDate}).`,
      sourceType: NotificationSourceType.SYSTEM,
      sourceId: newBudget.id,
      actionUrl: `/budgets/${newBudget.id}`,
      data: {
        budgetId: newBudget.id,
        recurrenceGroupId: newBudget.recurrenceGroupId,
        startDate: newStartDate,
        endDate: newEndDate,
        rolloverAmount: rolloverAmount.toFixed(2),
      },
      dedupKey: `budget-renew:${newBudget.recurrenceGroupId}:${newStartDate}`,
    });

    await this.invalidateReportCache(parentBudget.userId);
    return newBudget;
  }

  private async findRecord(userId: string, id: string) {
    const budget = await this.repository.findById(userId, id);

    if (!budget) {
      throw new AppError('Budget not found', 404, ERROR_CODE.NOT_FOUND);
    }

    return budget;
  }

  private async resolveCreateData(
    userId: string,
    data: CreateBudgetDto,
  ): Promise<PersistBudgetDto> {
    const categoryId = await this.resolveCategoryId(
      userId,
      data.type,
      data.categoryId,
    );
    const endDate = this.resolveEndDate(
      data.period,
      data.startDate,
      data.endDate,
    );
    const isRecurring = data.isRecurring ?? false;
    const recurrenceGroupId = isRecurring ? uuidv7() : null;
    const autoRenew = isRecurring ? (data.autoRenew ?? true) : false;
    const rolloverMode = data.rolloverMode ?? BudgetRolloverMode.RESET;

    return {
      name: data.name,
      amount: data.amount,
      type: data.type,
      period: data.period,
      categoryId,
      startDate: data.startDate,
      endDate,
      alertThreshold: data.alertThreshold,
      currency: data.currency,
      isRecurring,
      autoRenew,
      recurrenceGroupId,
      rolloverMode,
      autoRenewUntil: data.autoRenewUntil ?? null,
    };
  }

  private async resolveUpdateData(
    userId: string,
    current: BudgetRecord,
    data: UpdateBudgetDto,
  ): Promise<PersistBudgetDto> {
    const type = data.type ?? current.type;
    const period = data.period ?? current.period;
    const startDate =
      data.startDate ?? prismaDateToBusinessDate(current.startDate);
    const requestedCategoryId =
      data.categoryId !== undefined
        ? data.categoryId
        : data.type === BudgetType.OVERALL
          ? null
          : current.categoryId;
    const categoryId = await this.resolveCategoryId(
      userId,
      type,
      requestedCategoryId,
    );
    let customEndDate = data.endDate;

    if (
      period === BudgetPeriod.CUSTOM &&
      customEndDate === undefined &&
      current.period === BudgetPeriod.CUSTOM
    ) {
      customEndDate = prismaDateToBusinessDate(current.endDate);
    }

    if (period !== BudgetPeriod.CUSTOM && data.endDate !== undefined) {
      throw new AppError(
        'endDate is calculated automatically for recurring periods',
        422,
        ERROR_CODE.VALIDATION_ERROR,
      );
    }

    const endDate = this.resolveEndDate(period, startDate, customEndDate);

    const isRecurring =
      data.isRecurring !== undefined ? data.isRecurring : current.isRecurring;
    let recurrenceGroupId = current.recurrenceGroupId;
    if (isRecurring && !recurrenceGroupId) {
      recurrenceGroupId = uuidv7();
    } else if (!isRecurring) {
      recurrenceGroupId = null;
    }
    const autoRenew = isRecurring
      ? (data.autoRenew !== undefined ? data.autoRenew : current.autoRenew)
      : false;
    const rolloverMode = data.rolloverMode ?? current.rolloverMode;
    const autoRenewUntil =
      data.autoRenewUntil !== undefined
        ? data.autoRenewUntil
        : current.autoRenewUntil
          ? prismaDateToBusinessDate(current.autoRenewUntil)
          : null;

    return {
      name: data.name ?? current.name,
      amount: data.amount ?? current.amount.toFixed(2),
      type,
      period,
      categoryId,
      startDate,
      endDate,
      alertThreshold: data.alertThreshold ?? current.alertThreshold.toFixed(2),
      currency: data.currency ?? current.currency,
      isRecurring,
      autoRenew,
      recurrenceGroupId,
      rolloverMode,
      autoRenewUntil,
    };
  }

  private async resolveCategoryId(
    userId: string,
    type: BudgetType,
    categoryId: string | null | undefined,
  ): Promise<string | null> {
    if (type === BudgetType.OVERALL) {
      if (categoryId) {
        throw new AppError(
          'categoryId must be omitted for an overall budget',
          422,
          ERROR_CODE.VALIDATION_ERROR,
        );
      }

      return null;
    }

    if (!categoryId) {
      throw new AppError(
        'categoryId is required for a category budget',
        422,
        ERROR_CODE.VALIDATION_ERROR,
      );
    }

    await this.ensureExpenseCategory(userId, categoryId);
    return categoryId;
  }

  private async ensureExpenseCategory(userId: string, categoryId: string) {
    const category = await this.repository.findCategory(userId, categoryId);

    if (!category) {
      throw new AppError('Category not found', 404, ERROR_CODE.NOT_FOUND);
    }

    if (category.isArchived) {
      throw new AppError(
        'Archived category cannot be used for budgets',
        409,
        ERROR_CODE.CATEGORY_ARCHIVED,
      );
    }

    if (category.type !== TransactionType.EXPENSE) {
      throw new AppError(
        'Budgets can only target expense categories',
        409,
        ERROR_CODE.BUDGET_CATEGORY_TYPE_INVALID,
      );
    }
  }

  private resolveEndDate(
    period: BudgetPeriod,
    startDate: BusinessDate,
    customEndDate?: BusinessDate,
  ) {
    let endDate: BusinessDate;

    switch (period) {
      case BudgetPeriod.WEEKLY:
        endDate = addBusinessDays(startDate, 6);
        break;
      case BudgetPeriod.MONTHLY:
        endDate = addBusinessDays(addBusinessMonthsClamped(startDate, 1), -1);
        break;
      case BudgetPeriod.YEARLY:
        endDate = addBusinessDays(addBusinessMonthsClamped(startDate, 12), -1);
        break;
      default:
        if (!customEndDate) {
          throw new AppError(
            'endDate is required for a custom budget',
            422,
            ERROR_CODE.VALIDATION_ERROR,
          );
        }
        endDate = customEndDate;
    }

    if (endDate < startDate) {
      throw new AppError(
        'endDate must be on or after startDate',
        422,
        ERROR_CODE.VALIDATION_ERROR,
      );
    }

    return endDate;
  }

  private async toResponse(
    userId: string,
    budget: BudgetRecord,
  ): Promise<BudgetResponseDto> {
    const spending = await this.repository.getSpendingSummary(
      userId,
      budget.categoryId,
      budget.startDate,
      budget.endDate,
      budget.currency,
    );

    return this.formatBudgetResponse(budget, spending);
  }

  private formatBudgetResponse(
    budget: BudgetRecord,
    spending: BudgetSpendingSummary,
  ): BudgetResponseDto {
    return {
      ...budget,
      startDate: prismaDateToBusinessDate(budget.startDate),
      endDate: prismaDateToBusinessDate(budget.endDate),
      autoRenewUntil: budget.autoRenewUntil
        ? prismaDateToBusinessDate(budget.autoRenewUntil)
        : null,
      amount: budget.amount.toFixed(2),
      rolloverAmount: budget.rolloverAmount.toFixed(2),
      alertThreshold: budget.alertThreshold.toFixed(2),
      usage: this.calculateUsage(budget, spending),
    };
  }

  private calculateUsage(
    budget: BudgetRecord,
    spending: BudgetSpendingSummary,
  ) {
    const usagePercentage = budget.amount.isZero()
      ? new Prisma.Decimal(0)
      : spending.amount.dividedBy(budget.amount).times(100);
    const thresholdReached = usagePercentage.greaterThanOrEqualTo(
      budget.alertThreshold,
    );
    let status: BudgetUsageStatus = 'ON_TRACK';

    if (spending.amount.greaterThan(budget.amount)) {
      status = 'EXCEEDED';
    } else if (thresholdReached) {
      status = 'NEAR_LIMIT';
    }

    return {
      spentAmount: spending.amount.toFixed(2),
      remainingAmount: budget.amount.minus(spending.amount).toFixed(2),
      usagePercentage: usagePercentage.toFixed(2),
      transactionCount: spending.transactionCount,
      lastTransactionAt: spending.lastTransactionAt,
      timeStatus: this.getTimeStatus(budget),
      status,
    };
  }

  private getTimeStatus(budget: BudgetRecord): BudgetTimeStatus {
    const today = instantToBusinessDate(new Date());
    const startDate = prismaDateToBusinessDate(budget.startDate);
    const endDate = prismaDateToBusinessDate(budget.endDate);

    if (today < startDate) {
      return 'UPCOMING';
    }

    if (today > endDate) {
      return 'ENDED';
    }

    return 'ACTIVE';
  }

  private async invalidateReportCache(userId: string): Promise<void> {
    await cacheService.clearPattern(`finwise:cache:reports:${userId}:*`);
  }
}
