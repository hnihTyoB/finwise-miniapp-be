import { Prisma, SavingGoalStatus } from '@prisma/client';
import { AppError } from '../../common/errors/app-error';
import { ERROR_CODE } from '../../common/errors/error-code';
import { cacheService } from '../../common/services/cache.service';
import {
  businessDateToPrismaDate,
  instantToBusinessDate,
  prismaDateToBusinessDate,
} from '../../common/date-time/business-time';
import {
  CreateSavingContributionDto,
  CreateSavingGoalDto,
  SavingContributionQueryDto,
  SavingGoalQueryDto,
  SavingGoalResponseDto,
  UpdateSavingContributionDto,
  UpdateSavingGoalDto,
} from './saving-goal.dto';
import {
  SavingContributionSummary,
  SavingGoalRecord,
  SavingGoalRepository,
  SavingGoalTransaction,
} from './saving-goal.repository';

export class SavingGoalService {
  private readonly repository = new SavingGoalRepository();

  async findAll(userId: string, query: SavingGoalQueryDto) {
    const result = await this.repository.findAll(userId, query);
    const summaries = await this.repository.findSummaries(
      result.data.map((goal) => goal.id),
    );
    const summariesByGoal = new Map(
      summaries.map((summary) => [summary.savingGoalId, summary]),
    );
    const data = result.data.map((goal) =>
      this.toResponse(
        goal,
        summariesByGoal.get(goal.id) ?? this.emptySummary(goal.id),
      ),
    );

    return { data, meta: result.meta };
  }

  async findById(userId: string, id: string) {
    const goal = await this.findRecord(userId, id);
    const summary = await this.repository.findSummary(id);

    return this.toResponse(goal, summary);
  }

  async create(userId: string, data: CreateSavingGoalDto) {
    const goal = await this.repository.create(userId, data);
    await this.invalidateReportCache(userId);
    return this.toResponse(goal, this.emptySummary(goal.id));
  }

  async update(userId: string, id: string, data: UpdateSavingGoalDto) {
    const result = await this.repository.runSerializable(async (transaction) => {
      const current = await this.findRecord(userId, id, transaction);
      this.ensureMutable(current);
      const summary = await this.repository.findSummary(id, transaction);
      if (
        data.currency &&
        data.currency !== current.currency &&
        summary.contributionCount > 0
      ) {
        throw new AppError(
          'Currency cannot be changed after contributions have been recorded',
          409,
          ERROR_CODE.SAVING_GOAL_CURRENCY_LOCKED,
        );
      }
      const targetAmount = new Prisma.Decimal(
        data.targetAmount ?? current.targetAmount,
      );
      const completion = this.resolveCompletion(
        current,
        summary,
        targetAmount,
        data.status,
      );
      const goal = await this.repository.update(
        id,
        {
          ...data,
          ...completion,
        },
        transaction,
      );

      return this.toResponse(goal, summary);
    });

    await this.invalidateReportCache(userId);
    return result;
  }

  async archive(userId: string, id: string) {
    const result = await this.repository.runSerializable(async (transaction) => {
      const current = await this.findRecord(userId, id, transaction);
      const goal = current.isArchived
        ? current
        : await this.repository.archive(id, transaction);
      const summary = await this.repository.findSummary(id, transaction);

      return this.toResponse(goal, summary);
    });

    await this.invalidateReportCache(userId);
    return result;
  }

  async restore(userId: string, id: string) {
    const result = await this.repository.runSerializable(async (transaction) => {
      const current = await this.findRecord(userId, id, transaction);
      const summary = await this.repository.findSummary(id, transaction);

      if (!current.isArchived) {
        return this.toResponse(current, summary);
      }

      const completion = this.resolveCompletion(
        current,
        summary,
        current.targetAmount,
      );
      const goal = await this.repository.restore(
        id,
        completion.status,
        completion.completedAt,
        transaction,
      );

      return this.toResponse(goal, summary);
    });

    await this.invalidateReportCache(userId);
    return result;
  }

  async findContributions(
    userId: string,
    savingGoalId: string,
    query: SavingContributionQueryDto,
  ) {
    await this.findRecord(userId, savingGoalId);
    return this.repository.findContributions(savingGoalId, query);
  }

  async createContribution(
    userId: string,
    savingGoalId: string,
    data: CreateSavingContributionDto,
  ) {
    const result = await this.repository.runSerializable(async (transaction) => {
      const current = await this.findRecord(userId, savingGoalId, transaction);
      this.ensureCanContribute(current);
      const contribution = await this.repository.createContribution(
        savingGoalId,
        data,
        transaction,
      );
      const { goal, summary } = await this.reconcileProgress(
        current,
        transaction,
      );

      return {
        contribution,
        goal: this.toResponse(goal, summary),
      };
    });

    await this.invalidateReportCache(userId);
    return result;
  }

  async updateContribution(
    userId: string,
    savingGoalId: string,
    contributionId: string,
    data: UpdateSavingContributionDto,
  ) {
    const result = await this.repository.runSerializable(async (transaction) => {
      const current = await this.findRecord(userId, savingGoalId, transaction);
      this.ensureMutable(current);
      await this.findContributionRecord(
        savingGoalId,
        contributionId,
        transaction,
      );
      const contribution = await this.repository.updateContribution(
        contributionId,
        data,
        transaction,
      );
      const { goal, summary } = await this.reconcileProgress(
        current,
        transaction,
      );

      return {
        contribution,
        goal: this.toResponse(goal, summary),
      };
    });

    await this.invalidateReportCache(userId);
    return result;
  }

  async deleteContribution(
    userId: string,
    savingGoalId: string,
    contributionId: string,
  ) {
    const result = await this.repository.runSerializable(async (transaction) => {
      const current = await this.findRecord(userId, savingGoalId, transaction);
      this.ensureMutable(current);
      await this.findContributionRecord(
        savingGoalId,
        contributionId,
        transaction,
      );
      const deleted = await this.repository.deleteContribution(
        contributionId,
        transaction,
      );
      const { goal, summary } = await this.reconcileProgress(
        current,
        transaction,
      );

      return {
        id: deleted.id,
        goal: this.toResponse(goal, summary),
      };
    });

    await this.invalidateReportCache(userId);
    return result;
  }

  private async findRecord(
    userId: string,
    id: string,
    transaction?: SavingGoalTransaction,
  ) {
    const goal = await this.repository.findById(userId, id, transaction);

    if (!goal) {
      throw new AppError('Saving goal not found', 404, ERROR_CODE.NOT_FOUND);
    }

    return goal;
  }

  private async findContributionRecord(
    savingGoalId: string,
    contributionId: string,
    transaction: SavingGoalTransaction,
  ) {
    const contribution = await this.repository.findContributionById(
      savingGoalId,
      contributionId,
      transaction,
    );

    if (!contribution) {
      throw new AppError(
        'Saving contribution not found',
        404,
        ERROR_CODE.NOT_FOUND,
      );
    }

    return contribution;
  }

  private ensureMutable(goal: SavingGoalRecord) {
    if (goal.isArchived) {
      throw new AppError(
        'Restore the saving goal before modifying it',
        409,
        ERROR_CODE.SAVING_GOAL_ARCHIVED,
      );
    }
  }

  private ensureCanContribute(goal: SavingGoalRecord) {
    this.ensureMutable(goal);

    if (goal.status === SavingGoalStatus.PAUSED) {
      throw new AppError(
        'Resume the saving goal before adding contributions',
        409,
        ERROR_CODE.SAVING_GOAL_PAUSED,
      );
    }

    if (goal.status === SavingGoalStatus.COMPLETED) {
      throw new AppError(
        'The saving goal is already completed',
        409,
        ERROR_CODE.SAVING_GOAL_COMPLETED,
      );
    }
  }

  private async reconcileProgress(
    current: SavingGoalRecord,
    transaction: SavingGoalTransaction,
  ) {
    const summary = await this.repository.findSummary(current.id, transaction);
    const completion = this.resolveCompletion(
      current,
      summary,
      current.targetAmount,
    );
    const goal = await this.repository.update(
      current.id,
      completion,
      transaction,
    );

    return { goal, summary };
  }

  private resolveCompletion(
    current: SavingGoalRecord,
    summary: SavingContributionSummary,
    targetAmount: Prisma.Decimal,
    requestedStatus?: Extract<SavingGoalStatus, 'ACTIVE' | 'PAUSED'>,
  ) {
    if (summary.amount.greaterThanOrEqualTo(targetAmount)) {
      return {
        status: SavingGoalStatus.COMPLETED,
        completedAt: current.completedAt ?? new Date(),
      };
    }

    return {
      status:
        requestedStatus ??
        (current.status === SavingGoalStatus.COMPLETED
          ? SavingGoalStatus.ACTIVE
          : current.status),
      completedAt: null,
    };
  }

  private toResponse(
    goal: SavingGoalRecord,
    summary: SavingContributionSummary,
  ): SavingGoalResponseDto {
    const remainingAmount = Prisma.Decimal.max(
      goal.targetAmount.minus(summary.amount),
      new Prisma.Decimal(0),
    );
    const progressPercentage = goal.targetAmount.isZero()
      ? new Prisma.Decimal(0)
      : summary.amount.dividedBy(goal.targetAmount).times(100);
    const today = instantToBusinessDate(new Date());
    const targetDate = prismaDateToBusinessDate(goal.targetDate);
    const todayDate = businessDateToPrismaDate(today);
    const targetDateValue = businessDateToPrismaDate(targetDate);

    return {
      ...goal,
      targetDate,
      targetAmount: goal.targetAmount.toFixed(2),
      progress: {
        savedAmount: summary.amount.toFixed(2),
        remainingAmount: remainingAmount.toFixed(2),
        progressPercentage: progressPercentage.toFixed(2),
        contributionCount: summary.contributionCount,
        lastContributionAt: summary.lastContributionAt,
        daysRemaining: Math.max(
          0,
          Math.ceil(
            (targetDateValue.getTime() - todayDate.getTime()) / (24 * 60 * 60 * 1000),
          ),
        ),
        isOverdue:
          goal.status !== SavingGoalStatus.COMPLETED && targetDate < today,
      },
    };
  }

  private emptySummary(savingGoalId: string): SavingContributionSummary {
    return {
      savingGoalId,
      amount: new Prisma.Decimal(0),
      contributionCount: 0,
      lastContributionAt: null,
    };
  }
  private async invalidateReportCache(userId: string): Promise<void> {
    await cacheService.clearPattern(`finwise:cache:reports:${userId}:*`);
  }
}
