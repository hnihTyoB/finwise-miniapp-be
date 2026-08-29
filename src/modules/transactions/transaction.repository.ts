import { Prisma, TransactionType } from '@prisma/client';
import { prisma } from '../../database/prisma.client';
import {
  businessDateToPrismaDate,
  prismaDateToBusinessDate,
} from '../../common/date-time/business-time';
import {
  CreateTransactionDto,
  TransactionQueryDto,
  TransactionResponseDto,
  UpdateTransactionDto,
} from './transaction.dto';

const transactionSelect = {
  id: true,
  walletId: true,
  categoryId: true,
  amount: true,
  type: true,
  description: true,
  receiptUrl: true,
  location: true,
  date: true,
  createdAt: true,
  updatedAt: true,
  wallet: {
    select: {
      id: true,
      name: true,
      currency: true,
    },
  },
  category: {
    select: {
      id: true,
      name: true,
      type: true,
      icon: true,
      color: true,
    },
  },
} satisfies Prisma.TransactionSelect;

type TransactionRecord = Prisma.TransactionGetPayload<{
  select: typeof transactionSelect;
}>;

export type RepositoryTransaction = Prisma.TransactionClient;

function toTransactionResponse(transaction: TransactionRecord): TransactionResponseDto {
  return {
    ...transaction,
    date: prismaDateToBusinessDate(transaction.date),
    amount: transaction.amount.toFixed(2),
    receiptUrl: transaction.receiptUrl
      ? `/api/v1/transactions/${transaction.id}/receipt`
      : null,
  };
}

function client(transaction?: RepositoryTransaction) {
  return transaction ?? prisma;
}

export class TransactionRepository {
  async runSerializable<T>(
    operation: (transaction: RepositoryTransaction) => Promise<T>,
  ): Promise<T> {
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        const shouldRetry = error instanceof Prisma.PrismaClientKnownRequestError
          && error.code === 'P2034'
          && attempt < maxAttempts;

        if (!shouldRetry) {
          throw error;
        }
      }
    }

    throw new Error('Serializable transaction retry limit reached');
  }

  async findAll(userId: string, query: TransactionQueryDto) {
    const {
      search,
      walletId,
      categoryId,
      type,
      dateFrom,
      dateTo,
      minAmount,
      maxAmount,
      sortBy,
      order,
      page,
      limit,
    } = query;
    const where: Prisma.TransactionWhereInput = {
      userId,
      ...(walletId ? { walletId } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(type ? { type } : {}),
      ...(dateFrom || dateTo
        ? {
          date: {
            ...(dateFrom ? { gte: businessDateToPrismaDate(dateFrom) } : {}),
            ...(dateTo ? { lte: businessDateToPrismaDate(dateTo) } : {}),
          },
        }
        : {}),
      ...(minAmount || maxAmount
        ? {
          amount: {
            ...(minAmount ? { gte: minAmount } : {}),
            ...(maxAmount ? { lte: maxAmount } : {}),
          },
        }
        : {}),
      ...(search
        ? {
          OR: [
            { description: { contains: search, mode: Prisma.QueryMode.insensitive } },
            { location: { contains: search, mode: Prisma.QueryMode.insensitive } },
            { wallet: { name: { contains: search, mode: Prisma.QueryMode.insensitive } } },
            { category: { name: { contains: search, mode: Prisma.QueryMode.insensitive } } },
          ],
        }
        : {}),
    };
    const skip = (page - 1) * limit;

    const [transactions, total] = await prisma.$transaction([
      prisma.transaction.findMany({
        where,
        select: transactionSelect,
        orderBy: [
          { [sortBy]: order },
          { id: order },
        ],
        skip,
        take: limit,
      }),
      prisma.transaction.count({ where }),
    ]);

    return {
      data: transactions.map(toTransactionResponse),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findById(
    userId: string,
    id: string,
    transaction?: RepositoryTransaction,
  ) {
    const record = await client(transaction).transaction.findFirst({
      where: { id, userId },
      select: transactionSelect,
    });

    return record ? toTransactionResponse(record) : null;
  }

  findStoredReceipt(userId: string, id: string) {
    return prisma.transaction.findFirst({
      where: { id, userId },
      select: { id: true, receiptUrl: true },
    });
  }

  findWallet(
    userId: string,
    walletId: string,
    transaction: RepositoryTransaction,
  ) {
    return transaction.wallet.findFirst({
      where: { id: walletId, userId },
      select: { id: true, isArchived: true },
    });
  }

  findCategory(
    userId: string,
    categoryId: string,
    transaction: RepositoryTransaction,
  ) {
    return transaction.category.findFirst({
      where: {
        id: categoryId,
        OR: [
          { userId },
          { userId: null, isSystem: true },
        ],
      },
      select: {
        id: true,
        type: true,
        isArchived: true,
      },
    });
  }

  async create(
    userId: string,
    data: CreateTransactionDto,
    transaction: RepositoryTransaction,
  ) {
    const created = await transaction.transaction.create({
      data: {
        userId,
        walletId: data.walletId,
        categoryId: data.categoryId,
        amount: data.amount,
        type: data.type,
        description: data.description,
        location: data.location,
        date: businessDateToPrismaDate(data.date),
      },
      select: transactionSelect,
    });

    return toTransactionResponse(created);
  }

  async update(
    id: string,
    data: UpdateTransactionDto,
    transaction: RepositoryTransaction,
  ) {
    const updated = await transaction.transaction.update({
      where: { id },
      data: {
        ...data,
        ...(data.date ? { date: businessDateToPrismaDate(data.date) } : {}),
      },
      select: transactionSelect,
    });

    return toTransactionResponse(updated);
  }

  adjustWalletBalance(
    walletId: string,
    amount: Prisma.Decimal,
    type: TransactionType,
    direction: 'APPLY' | 'REVERSE',
    transaction: RepositoryTransaction,
  ) {
    const signedAmount = type === TransactionType.INCOME ? amount : amount.negated();
    const delta = direction === 'APPLY' ? signedAmount : signedAmount.negated();

    return transaction.wallet.update({
      where: { id: walletId },
      data: { balance: { increment: delta } },
      select: { id: true },
    });
  }

  delete(id: string, transaction: RepositoryTransaction) {
    return transaction.transaction.delete({
      where: { id },
      select: { id: true, receiptUrl: true },
    });
  }

  async replaceReceipt(
    userId: string,
    id: string,
    receiptKey: string | null,
  ) {
    return this.runSerializable(async (transaction) => {
      const current = await transaction.transaction.findFirst({
        where: { id, userId },
        select: { id: true, receiptUrl: true },
      });

      if (!current) {
        return null;
      }

      const updated = await transaction.transaction.update({
        where: { id },
        data: { receiptUrl: receiptKey },
        select: transactionSelect,
      });

      return {
        transaction: toTransactionResponse(updated),
        previousReceiptKey: current.receiptUrl,
      };
    });
  }
}
