import { Prisma, SavingGoalStatus } from '@prisma/client';
import { prisma } from '../../database/prisma.client';
import {
  addBusinessDays,
  businessDateToPrismaDate,
  businessWallTimeToInstant,
} from '../../common/date-time/business-time';
import {
  CreateSavingContributionDto,
  CreateSavingGoalDto,
  SavingContributionQueryDto,
  SavingContributionResponseDto,
  SavingGoalQueryDto,
  UpdateSavingContributionDto,
  UpdateSavingGoalDto,
} from './saving-goal.dto';

const savingGoalSelect = {
  id: true,
  name: true,
  targetAmount: true,
  currency: true,
  targetDate: true,
  description: true,
  icon: true,
  color: true,
  status: true,
  completedAt: true,
  isArchived: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.SavingGoalSelect;

const savingContributionSelect = {
  id: true,
  savingGoalId: true,
  amount: true,
  contributedAt: true,
  note: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.SavingContributionSelect;

export type SavingGoalRecord = Prisma.SavingGoalGetPayload<{
  select: typeof savingGoalSelect;
}>;

type SavingContributionRecord = Prisma.SavingContributionGetPayload<{
  select: typeof savingContributionSelect;
}>;

export type SavingGoalTransaction = Prisma.TransactionClient;

export interface SavingContributionSummary {
  savingGoalId: string;
  amount: Prisma.Decimal;
  contributionCount: number;
  lastContributionAt: Date | null;
}

type SavingGoalUpdateData = Omit<UpdateSavingGoalDto, 'status'> & {
  status?: SavingGoalStatus;
  completedAt?: Date | null;
};

function client(transaction?: SavingGoalTransaction) {
  return transaction ?? prisma;
}

function toContributionResponse(
  contribution: SavingContributionRecord,
): SavingContributionResponseDto {
  return {
    ...contribution,
    amount: contribution.amount.toFixed(2),
  };
}

export class SavingGoalRepository {
  async runSerializable<T>(
    operation: (transaction: SavingGoalTransaction) => Promise<T>,
  ): Promise<T> {
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
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

  async findAll(userId: string, query: SavingGoalQueryDto) {
    const {
      search,
      status,
      dueFrom,
      dueTo,
      includeArchived,
      sortBy,
      order,
      page,
      limit,
    } = query;
    const where: Prisma.SavingGoalWhereInput = {
      userId,
      ...(status ? { status } : {}),
      ...(includeArchived ? {} : { isArchived: false }),
      ...(dueFrom || dueTo
        ? {
            targetDate: {
              ...(dueFrom ? { gte: businessDateToPrismaDate(dueFrom) } : {}),
              ...(dueTo ? { lte: businessDateToPrismaDate(dueTo) } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              {
                name: { contains: search, mode: Prisma.QueryMode.insensitive },
              },
              {
                description: {
                  contains: search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
            ],
          }
        : {}),
    };
    const skip = (page - 1) * limit;
    const [goals, total] = await prisma.$transaction([
      prisma.savingGoal.findMany({
        where,
        select: savingGoalSelect,
        orderBy: [{ [sortBy]: order }, { id: order }],
        skip,
        take: limit,
      }),
      prisma.savingGoal.count({ where }),
    ]);

    return {
      data: goals,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  findById(userId: string, id: string, transaction?: SavingGoalTransaction) {
    return client(transaction).savingGoal.findFirst({
      where: { id, userId },
      select: savingGoalSelect,
    });
  }

  create(userId: string, data: CreateSavingGoalDto) {
    return prisma.savingGoal.create({
      data: {
        userId,
        ...data,
        targetDate: businessDateToPrismaDate(data.targetDate),
      },
      select: savingGoalSelect,
    });
  }

  update(
    id: string,
    data: SavingGoalUpdateData,
    transaction: SavingGoalTransaction,
  ) {
    return transaction.savingGoal.update({
      where: { id },
      data: {
        ...data,
        ...(data.targetDate ? { targetDate: businessDateToPrismaDate(data.targetDate) } : {}),
      },
      select: savingGoalSelect,
    });
  }

  archive(id: string, transaction: SavingGoalTransaction) {
    return transaction.savingGoal.update({
      where: { id },
      data: { isArchived: true },
      select: savingGoalSelect,
    });
  }

  restore(
    id: string,
    status: SavingGoalStatus,
    completedAt: Date | null,
    transaction: SavingGoalTransaction,
  ) {
    return transaction.savingGoal.update({
      where: { id },
      data: {
        isArchived: false,
        status,
        completedAt,
      },
      select: savingGoalSelect,
    });
  }

  async findSummaries(
    savingGoalIds: string[],
    transaction?: SavingGoalTransaction,
  ): Promise<SavingContributionSummary[]> {
    if (savingGoalIds.length === 0) {
      return [];
    }

    const summaries = await client(transaction).savingContribution.groupBy({
      by: ['savingGoalId'],
      where: { savingGoalId: { in: savingGoalIds } },
      _sum: { amount: true },
      _count: { _all: true },
      _max: { contributedAt: true },
    });

    return summaries.map((summary) => ({
      savingGoalId: summary.savingGoalId,
      amount: summary._sum.amount ?? new Prisma.Decimal(0),
      contributionCount: summary._count._all,
      lastContributionAt: summary._max.contributedAt,
    }));
  }

  async findSummary(
    savingGoalId: string,
    transaction?: SavingGoalTransaction,
  ): Promise<SavingContributionSummary> {
    const result = await client(transaction).savingContribution.aggregate({
      where: { savingGoalId },
      _sum: { amount: true },
      _count: { _all: true },
      _max: { contributedAt: true },
    });

    return {
      savingGoalId,
      amount: result._sum.amount ?? new Prisma.Decimal(0),
      contributionCount: result._count._all,
      lastContributionAt: result._max.contributedAt,
    };
  }

  async findContributions(
    savingGoalId: string,
    query: SavingContributionQueryDto,
  ) {
    const { dateFrom, dateTo, sortBy, order, page, limit } = query;
    const where: Prisma.SavingContributionWhereInput = {
      savingGoalId,
      ...(dateFrom || dateTo
        ? {
            contributedAt: {
              ...(dateFrom ? { gte: businessWallTimeToInstant(dateFrom) } : {}),
              ...(dateTo ? { lt: businessWallTimeToInstant(addBusinessDays(dateTo, 1)) } : {}),
            },
          }
        : {}),
    };
    const skip = (page - 1) * limit;
    const [contributions, total] = await prisma.$transaction([
      prisma.savingContribution.findMany({
        where,
        select: savingContributionSelect,
        orderBy: [{ [sortBy]: order }, { id: order }],
        skip,
        take: limit,
      }),
      prisma.savingContribution.count({ where }),
    ]);

    return {
      data: contributions.map(toContributionResponse),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  findContributionById(
    savingGoalId: string,
    id: string,
    transaction: SavingGoalTransaction,
  ) {
    return transaction.savingContribution.findFirst({
      where: { id, savingGoalId },
      select: savingContributionSelect,
    });
  }

  async createContribution(
    savingGoalId: string,
    data: CreateSavingContributionDto,
    transaction: SavingGoalTransaction,
  ) {
    const contribution = await transaction.savingContribution.create({
      data: {
        savingGoalId,
        ...data,
      },
      select: savingContributionSelect,
    });

    return toContributionResponse(contribution);
  }

  async updateContribution(
    id: string,
    data: UpdateSavingContributionDto,
    transaction: SavingGoalTransaction,
  ) {
    const contribution = await transaction.savingContribution.update({
      where: { id },
      data,
      select: savingContributionSelect,
    });

    return toContributionResponse(contribution);
  }

  deleteContribution(id: string, transaction: SavingGoalTransaction) {
    return transaction.savingContribution.delete({
      where: { id },
      select: { id: true },
    });
  }
}
