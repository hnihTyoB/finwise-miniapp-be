import {
  NotificationChannel,
  NotificationDeliveryStatus,
  Prisma,
  SavingGoalStatus,
  TransactionType,
} from '@prisma/client';
import { prisma } from '../../database/prisma.client';
import {
  addBusinessDays,
  BusinessDate,
  businessDateToPrismaDate,
  instantToBusinessDate,
} from '../../common/date-time/business-time';
import {
  CreateNotificationInput,
  NotificationQueryDto,
  NotificationSettingDto,
  UpdateNotificationSettingDto,
} from './notification.dto';

const notificationSelect = {
  id: true,
  type: true,
  priority: true,
  title: true,
  message: true,
  channels: true,
  data: true,
  actionUrl: true,
  sourceType: true,
  sourceId: true,
  readAt: true,
  expiresAt: true,
  createdAt: true,
  updatedAt: true,
  deliveries: {
    select: {
      channel: true,
      status: true,
      attemptCount: true,
      sentAt: true,
    },
  },
} satisfies Prisma.NotificationSelect;

const settingSelect = {
  channels: true,
  zaloBotChatId: true,
  budgetAlertsEnabled: true,
  savingGoalAlertsEnabled: true,
  reminderAlertsEnabled: true,
  unusualTxnAlertsEnabled: true,
} satisfies Prisma.NotificationSettingSelect;

export type NotificationRecord = Prisma.NotificationGetPayload<{
  select: typeof notificationSelect;
}>;

export interface BudgetAlertCandidate {
  id: string;
  userId: string;
  name: string;
  amount: Prisma.Decimal;
  currency: string;
  alertThreshold: Prisma.Decimal;
  startDate: Date;
  endDate: Date;
  spentAmount: Prisma.Decimal;
}

export interface SavingGoalAlertCandidate {
  id: string;
  userId: string;
  name: string;
  targetAmount: Prisma.Decimal;
  currency: string;
  targetDate: Date;
  status: SavingGoalStatus;
  savedAmount: Prisma.Decimal;
}

export interface ExpenseBaseline {
  count: number;
  average: Prisma.Decimal;
}

export class NotificationRepository {
  async findAll(userId: string, query: NotificationQueryDto) {
    const { type, priority, isRead, page, limit } = query;
    const now = new Date();
    const where: Prisma.NotificationWhereInput = {
      userId,
      channels: { has: NotificationChannel.IN_APP },
      ...(type ? { type } : {}),
      ...(priority ? { priority } : {}),
      ...(isRead === true ? { readAt: { not: null } } : {}),
      ...(isRead === false ? { readAt: null } : {}),
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    };
    const skip = (page - 1) * limit;
    const [notifications, total] = await prisma.$transaction([
      prisma.notification.findMany({
        where,
        select: notificationSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: limit,
      }),
      prisma.notification.count({ where }),
    ]);

    return {
      data: notifications,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  findById(userId: string, id: string) {
    return prisma.notification.findFirst({
      where: {
        id,
        userId,
        channels: { has: NotificationChannel.IN_APP },
      },
      select: notificationSelect,
    });
  }

  unreadCount(userId: string) {
    return prisma.notification.count({
      where: {
        userId,
        readAt: null,
        channels: { has: NotificationChannel.IN_APP },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
  }

  markRead(id: string) {
    return prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
      select: notificationSelect,
    });
  }

  async markAllRead(userId: string) {
    const result = await prisma.notification.updateMany({
      where: {
        userId,
        readAt: null,
        channels: { has: NotificationChannel.IN_APP },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      data: { readAt: new Date() },
    });
    return result.count;
  }

  remove(id: string) {
    return prisma.notification.delete({ where: { id }, select: { id: true } });
  }

  getSetting(userId: string): Promise<NotificationSettingDto | null> {
    return prisma.notificationSetting.findUnique({
      where: { userId },
      select: settingSelect,
    });
  }

  updateSetting(userId: string, data: UpdateNotificationSettingDto) {
    return prisma.notificationSetting.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
      select: settingSelect,
    });
  }

  async createIfAbsent(
    input: CreateNotificationInput,
    channels: NotificationChannel[],
  ): Promise<NotificationRecord | null> {
    const externalChannels = channels.filter(
      (channel) => channel !== NotificationChannel.IN_APP,
    );

    try {
      return await prisma.notification.create({
        data: {
          userId: input.userId,
          type: input.type,
          priority: input.priority,
          title: input.title,
          message: input.message,
          channels,
          data: input.data,
          actionUrl: input.actionUrl,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          dedupKey: input.dedupKey,
          expiresAt: input.expiresAt,
          deliveries: externalChannels.length > 0
            ? {
                create: externalChannels.map((channel) => ({ channel })),
              }
            : undefined,
        },
        select: notificationSelect,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === 'P2002'
      ) {
        return null;
      }
      throw error;
    }
  }

  async findBudgetCandidates(
    now: Date,
    cursorId?: string,
    limit: number = 100,
  ): Promise<BudgetAlertCandidate[]> {
    const today = businessDateToPrismaDate(instantToBusinessDate(now));
    const budgets = await prisma.budget.findMany({
      where: {
        isArchived: false,
        startDate: { lte: today },
        endDate: { gte: today },
      },
      select: {
        id: true,
        userId: true,
        name: true,
        amount: true,
        currency: true,
        alertThreshold: true,
        startDate: true,
        endDate: true,
        categoryId: true,
      },
      orderBy: { id: 'asc' },
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      take: limit,
    });

    if (budgets.length === 0) {
      return [];
    }

    const budgetIds = budgets.map((b) => b.id);
    const spendingSums = await prisma.$queryRaw<Array<{ budget_id: string; total_spent: string }>>`
      SELECT b.id AS budget_id, COALESCE(SUM(t.amount), 0)::text AS total_spent
      FROM budgets b
      LEFT JOIN wallets w ON w.user_id = b.user_id AND w.currency = b.currency
      LEFT JOIN transactions t ON t.wallet_id = w.id
        AND t.user_id = b.user_id
        AND t.type = 'EXPENSE'
        AND t.date >= b.start_date
        AND t.date <= b.end_date
        AND (b.category_id IS NULL OR t.category_id = b.category_id)
      WHERE b.id = ANY(${budgetIds}::uuid[])
      GROUP BY b.id;
    `;

    const spentByBudgetId = new Map<string, Prisma.Decimal>(
      spendingSums.map((row) => [row.budget_id, new Prisma.Decimal(row.total_spent)]),
    );

    return budgets.map((budget) => ({
      ...budget,
      spentAmount: spentByBudgetId.get(budget.id) ?? new Prisma.Decimal(0),
    }));
  }

  async findSavingGoalCandidates(
    cursorId?: string,
    limit: number = 100,
  ): Promise<SavingGoalAlertCandidate[]> {
    const goals = await prisma.savingGoal.findMany({
      where: {
        isArchived: false,
        status: { in: [SavingGoalStatus.ACTIVE, SavingGoalStatus.COMPLETED] },
      },
      select: {
        id: true,
        userId: true,
        name: true,
        targetAmount: true,
        currency: true,
        targetDate: true,
        status: true,
      },
      orderBy: { id: 'asc' },
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      take: limit,
    });
    const summaries = goals.length === 0
      ? []
      : await prisma.savingContribution.groupBy({
          by: ['savingGoalId'],
          where: { savingGoalId: { in: goals.map((goal) => goal.id) } },
          _sum: { amount: true },
        });
    const savedByGoalId = new Map(
      summaries.map((summary) => [
        summary.savingGoalId,
        summary._sum.amount ?? new Prisma.Decimal(0),
      ]),
    );

    return goals.map((goal) => ({
      ...goal,
      savedAmount: savedByGoalId.get(goal.id) ?? new Prisma.Decimal(0),
    }));
  }

  async getExpenseBaseline(
    userId: string,
    transactionId: string,
    walletId: string,
    occurredAt: BusinessDate,
  ): Promise<ExpenseBaseline> {
    const from = businessDateToPrismaDate(addBusinessDays(occurredAt, -90));
    const through = businessDateToPrismaDate(occurredAt);
    const aggregate = await prisma.transaction.aggregate({
      where: {
        userId,
        id: { not: transactionId },
        walletId,
        type: TransactionType.EXPENSE,
        date: { gte: from, lte: through },
      },
      _count: { _all: true },
      _avg: { amount: true },
    });

    return {
      count: aggregate._count._all,
      average: aggregate._avg.amount ?? new Prisma.Decimal(0),
    };
  }

  findDueDeliveries(now: Date, staleBefore: Date, limit: number = 50) {
    return prisma.notificationDelivery.findMany({
      where: {
        attemptCount: { lt: 5 },
        OR: [
          {
            status: {
              in: [
                NotificationDeliveryStatus.PENDING,
                NotificationDeliveryStatus.FAILED,
              ],
            },
            nextAttemptAt: { lte: now },
          },
          {
            status: NotificationDeliveryStatus.PROCESSING,
            updatedAt: { lt: staleBefore },
          },
        ],
      },
      select: { id: true },
      orderBy: { nextAttemptAt: 'asc' },
      take: limit,
    });
  }

  async claimDelivery(id: string, now: Date, staleBefore: Date) {
    const claimed = await prisma.notificationDelivery.updateMany({
      where: {
        id,
        attemptCount: { lt: 5 },
        OR: [
          {
            status: {
              in: [
                NotificationDeliveryStatus.PENDING,
                NotificationDeliveryStatus.FAILED,
              ],
            },
            nextAttemptAt: { lte: now },
          },
          {
            status: NotificationDeliveryStatus.PROCESSING,
            updatedAt: { lt: staleBefore },
          },
        ],
      },
      data: {
        status: NotificationDeliveryStatus.PROCESSING,
        attemptCount: { increment: 1 },
      },
    });

    if (claimed.count === 0) {
      return null;
    }

    return prisma.notificationDelivery.findUnique({
      where: { id },
      select: {
        id: true,
        channel: true,
        attemptCount: true,
        notification: {
          select: {
            title: true,
            message: true,
            actionUrl: true,
            user: {
              select: {
                email: true,
                fullName: true,
                notificationSetting: {
                  select: { zaloBotChatId: true },
                },
              },
            },
          },
        },
      },
    });
  }

  completeDelivery(
    id: string,
    status: NotificationDeliveryStatus,
    failureReason?: string,
  ) {
    return prisma.notificationDelivery.update({
      where: { id },
      data: {
        status,
        sentAt: status === NotificationDeliveryStatus.SENT ? new Date() : null,
        failureReason,
      },
    });
  }

  failDelivery(id: string, nextAttemptAt: Date, failureReason: string) {
    return prisma.notificationDelivery.update({
      where: { id },
      data: {
        status: NotificationDeliveryStatus.FAILED,
        nextAttemptAt,
        failureReason,
      },
    });
  }
}
