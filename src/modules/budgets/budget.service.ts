import {
  BudgetPeriod,
  BudgetType,
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

export class BudgetService {
  private readonly repository = new BudgetRepository();

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
    };
  }

  private async resolveUpdateData(
    userId: string,
    current: BudgetRecord,
    data: UpdateBudgetDto,
  ): Promise<PersistBudgetDto> {
    const type = data.type ?? current.type;
    const period = data.period ?? current.period;
    const startDate = data.startDate ?? prismaDateToBusinessDate(current.startDate);
    const requestedCategoryId = data.categoryId !== undefined
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
      period === BudgetPeriod.CUSTOM
      && customEndDate === undefined
      && current.period === BudgetPeriod.CUSTOM
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
      amount: budget.amount.toFixed(2),
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
