import {
  NotificationPriority,
  NotificationSourceType,
  NotificationType,
  Prisma,
  SavingGoalStatus,
  TransactionType,
} from '@prisma/client';
import { AppError } from '../../common/errors/app-error';
import { ERROR_CODE } from '../../common/errors/error-code';
import {
  addBusinessDays,
  BusinessDate,
  instantToBusinessDate,
  prismaDateToBusinessDate,
} from '../../common/date-time/business-time';
import {
  CreateNotificationInput,
  DEFAULT_NOTIFICATION_SETTING,
  NotificationQueryDto,
  NotificationSettingDto,
  UpdateNotificationSettingDto,
} from './notification.dto';
import {
  BudgetAlertCandidate,
  NotificationRepository,
  SavingGoalAlertCandidate,
} from './notification.repository';

import { AnomalyService } from '../anomalies/anomaly.service';
import { webhookService } from '../webhooks/webhook.service';

const GOAL_NEAR_TARGET_PERCENT = new Prisma.Decimal(80);
const GOAL_DUE_SOON_DAYS = 7;

interface TransactionForAnomalyCheck {
  id: string;
  walletId: string;
  categoryId?: string;
  amount: string;
  type: TransactionType;
  date: BusinessDate;
  wallet: { currency: string };
}

export class NotificationService {
  private readonly repository = new NotificationRepository();
  private readonly anomalyService = new AnomalyService();

  findAll(userId: string, query: NotificationQueryDto) {
    return this.repository.findAll(userId, query);
  }

  unreadCount(userId: string) {
    return this.repository.unreadCount(userId);
  }

  async markRead(userId: string, id: string) {
    const notification = await this.findOwned(userId, id);
    return notification.readAt
      ? notification
      : this.repository.markRead(notification.id);
  }

  async markAllRead(userId: string) {
    return this.repository.markAllRead(userId);
  }

  async remove(userId: string, id: string) {
    await this.findOwned(userId, id);
    return this.repository.remove(id);
  }

  async getSetting(userId: string): Promise<NotificationSettingDto> {
    return (await this.repository.getSetting(userId))
      ?? DEFAULT_NOTIFICATION_SETTING;
  }

  updateSetting(userId: string, data: UpdateNotificationSettingDto) {
    return this.repository.updateSetting(userId, data);
  }

  async create(input: CreateNotificationInput) {
    const setting = await this.getSetting(input.userId);
    if (!this.isEnabled(input.type, setting)) {
      return null;
    }
    return this.repository.createIfAbsent(input, setting.channels);
  }

  async getChannelsForType(type: NotificationType, userId: string) {
    const setting = await this.getSetting(userId);
    return this.isEnabled(type, setting) ? setting.channels : null;
  }

  async scanFinancialAlerts(now: Date) {
    let budgetCursor: string | undefined;
    do {
      const candidates = await this.repository.findBudgetCandidates(now, budgetCursor);
      for (const candidate of candidates) {
        await this.processBudgetCandidate(candidate);
      }
      budgetCursor = candidates.length > 0 ? candidates[candidates.length - 1].id : undefined;
    } while (budgetCursor);

    let goalCursor: string | undefined;
    do {
      const candidates = await this.repository.findSavingGoalCandidates(goalCursor);
      for (const candidate of candidates) {
        await this.processSavingGoalCandidate(candidate, now);
      }
      goalCursor = candidates.length === 100
        ? candidates[candidates.length - 1].id
        : undefined;
    } while (goalCursor);
  }

  async processBudgetCandidate(candidate: BudgetAlertCandidate) {
    const usage = candidate.spentAmount
      .dividedBy(candidate.amount)
      .times(100);
    const keySuffix = `${prismaDateToBusinessDate(candidate.startDate)}:${candidate.amount.toFixed(2)}`;
    const common = {
      userId: candidate.userId,
      sourceType: NotificationSourceType.BUDGET,
      sourceId: candidate.id,
      actionUrl: `/budgets/${candidate.id}`,
      data: {
        budgetId: candidate.id,
        spentAmount: candidate.spentAmount.toFixed(2),
        budgetAmount: candidate.amount.toFixed(2),
        currency: candidate.currency,
        usagePercentage: usage.toFixed(2),
      },
    };

    if (candidate.spentAmount.greaterThan(candidate.amount)) {
      webhookService
        .dispatchEventToUser(candidate.userId, 'budget.exceeded', {
          budgetId: candidate.id,
          budgetName: candidate.name,
          budgetAmount: candidate.amount.toFixed(2),
          spentAmount: candidate.spentAmount.toFixed(2),
          currency: candidate.currency,
          usagePercentage: usage.toFixed(2),
        })
        .catch((err) => console.error('[Webhook] Failed to dispatch budget.exceeded:', err));

      return this.create({
        ...common,
        type: NotificationType.BUDGET_EXCEEDED,
        priority: NotificationPriority.CRITICAL,
        title: `Budget exceeded: ${candidate.name}`,
        message: `Spending has reached ${usage.toFixed(0)}% of this budget.`,
        dedupKey: `budget:${candidate.id}:exceeded:${keySuffix}`,
      });
    }

    if (usage.greaterThanOrEqualTo(candidate.alertThreshold)) {
      webhookService
        .dispatchEventToUser(candidate.userId, 'budget.warning', {
          budgetId: candidate.id,
          budgetName: candidate.name,
          budgetAmount: candidate.amount.toFixed(2),
          spentAmount: candidate.spentAmount.toFixed(2),
          currency: candidate.currency,
          usagePercentage: usage.toFixed(2),
        })
        .catch((err) => console.error('[Webhook] Failed to dispatch budget.warning:', err));

      return this.create({
        ...common,
        type: NotificationType.BUDGET_NEAR_LIMIT,
        priority: NotificationPriority.HIGH,
        title: `Budget nearing limit: ${candidate.name}`,
        message: `Spending has reached ${usage.toFixed(0)}% of this budget.`,
        dedupKey: `budget:${candidate.id}:near:${keySuffix}`,
      });
    }

    return null;
  }

  async processSavingGoalCandidate(candidate: SavingGoalAlertCandidate, now: Date) {
    const progress = candidate.savedAmount
      .dividedBy(candidate.targetAmount)
      .times(100);
    const common = {
      userId: candidate.userId,
      sourceType: NotificationSourceType.SAVING_GOAL,
      sourceId: candidate.id,
      actionUrl: `/saving-goals/${candidate.id}`,
      data: {
        savingGoalId: candidate.id,
        savedAmount: candidate.savedAmount.toFixed(2),
        targetAmount: candidate.targetAmount.toFixed(2),
        currency: candidate.currency,
        progressPercentage: progress.toFixed(2),
      },
    };
    const targetKey = candidate.targetAmount.toFixed(2);

    if (
      candidate.status === SavingGoalStatus.COMPLETED
      || candidate.savedAmount.greaterThanOrEqualTo(candidate.targetAmount)
    ) {
      webhookService
        .dispatchEventToUser(candidate.userId, 'saving_goal.achieved', {
          savingGoalId: candidate.id,
          name: candidate.name,
          targetAmount: candidate.targetAmount.toFixed(2),
          savedAmount: candidate.savedAmount.toFixed(2),
          currency: candidate.currency,
          progressPercentage: progress.toFixed(2),
        })
        .catch((err) => console.error('[Webhook] Failed to dispatch saving_goal.achieved:', err));

      await this.create({
        ...common,
        type: NotificationType.SAVING_GOAL_ACHIEVED,
        priority: NotificationPriority.HIGH,
        title: `Saving goal achieved: ${candidate.name}`,
        message: 'Congratulations! You have reached this saving goal.',
        dedupKey: `saving-goal:${candidate.id}:achieved:${targetKey}`,
      });
      return;
    }

    if (progress.greaterThanOrEqualTo(GOAL_NEAR_TARGET_PERCENT)) {
      await this.create({
        ...common,
        type: NotificationType.SAVING_GOAL_NEAR_TARGET,
        priority: NotificationPriority.NORMAL,
        title: `Saving goal almost reached: ${candidate.name}`,
        message: `You have completed ${progress.toFixed(0)}% of this saving goal.`,
        dedupKey: `saving-goal:${candidate.id}:near:${targetKey}`,
      });
    }

    const today = instantToBusinessDate(now);
    const dueSoonDate = addBusinessDays(today, GOAL_DUE_SOON_DAYS);
    const targetDate = prismaDateToBusinessDate(candidate.targetDate);
    if (targetDate >= today && targetDate <= dueSoonDate) {
      await this.create({
        ...common,
        type: NotificationType.SAVING_GOAL_DUE_SOON,
        priority: NotificationPriority.HIGH,
        title: `Saving goal deadline approaching: ${candidate.name}`,
        message: `The target date is ${prismaDateToBusinessDate(candidate.targetDate)}.`,
        dedupKey: `saving-goal:${candidate.id}:due:${prismaDateToBusinessDate(candidate.targetDate)}`,
      });
    }
  }

  async detectUnusualTransaction(userId: string, transaction: TransactionForAnomalyCheck) {
    if (transaction.type !== TransactionType.EXPENSE || !transaction.categoryId) {
      return;
    }

    try {
      const evaluation = await this.anomalyService.evaluateTransaction(userId, {
        transactionId: transaction.id,
        walletId: transaction.walletId,
        categoryId: transaction.categoryId,
        amount: transaction.amount,
        type: transaction.type,
      });

      if (!evaluation.isAnomaly) {
        return;
      }

      webhookService
        .dispatchEventToUser(userId, 'transaction.anomaly_detected', {
          transactionId: transaction.id,
          amount: transaction.amount,
          currency: transaction.wallet.currency,
          anomalyScore: evaluation.anomalyScore,
          severity: evaluation.severity,
          reasonCodes: evaluation.reasonCodes,
          explanation: evaluation.explanation,
          detectedAt: new Date().toISOString(),
        })
        .catch((err) => console.error('[Webhook] Failed to dispatch anomaly event:', err));

      await this.create({
        userId,
        type: NotificationType.UNUSUAL_TRANSACTION,
        priority: evaluation.severity === 'CRITICAL' ? NotificationPriority.CRITICAL : NotificationPriority.HIGH,
        title: 'Unusual transaction detected',
        message: evaluation.explanation,
        sourceType: NotificationSourceType.TRANSACTION,
        sourceId: transaction.id,
        actionUrl: `/transactions/${transaction.id}`,
        data: {
          transactionId: transaction.id,
          amount: transaction.amount,
          currency: transaction.wallet.currency,
          anomalyScore: evaluation.anomalyScore,
          primaryReason: evaluation.reasonCodes[0] ?? null,
          modifiedZScore: evaluation.metrics.modifiedZScore,
          categoryMedian: evaluation.metrics.categoryMedian,
        },
        dedupKey: `transaction:${transaction.id}:unusual`,
      });
    } catch (error) {
      console.error('Failed to evaluate unusual transaction notification', error);
    }
  }

  private async findOwned(userId: string, id: string) {
    const notification = await this.repository.findById(userId, id);
    if (!notification) {
      throw new AppError('Notification not found', 404, ERROR_CODE.NOT_FOUND);
    }
    return notification;
  }

  private isEnabled(type: NotificationType, setting: NotificationSettingDto) {
    if (
      type === NotificationType.BUDGET_NEAR_LIMIT
      || type === NotificationType.BUDGET_EXCEEDED
    ) {
      return setting.budgetAlertsEnabled;
    }
    if (
      type === NotificationType.SAVING_GOAL_NEAR_TARGET
      || type === NotificationType.SAVING_GOAL_ACHIEVED
      || type === NotificationType.SAVING_GOAL_DUE_SOON
    ) {
      return setting.savingGoalAlertsEnabled;
    }
    if (
      type === NotificationType.USER_REMINDER
      || type === NotificationType.RECURRING_PAYMENT_DUE
    ) {
      return setting.reminderAlertsEnabled;
    }
    if (type === NotificationType.UNUSUAL_TRANSACTION) {
      return setting.unusualTxnAlertsEnabled;
    }
    return true;
  }
}
