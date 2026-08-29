import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.client';
import {
  CreateTransferDto,
  TransferQueryDto,
  TransferResponseDto,
} from './transfer.dto';

const transferSelect = {
  id: true,
  sourceWalletId: true,
  destinationWalletId: true,
  amount: true,
  note: true,
  transferredAt: true,
  createdAt: true,
  updatedAt: true,
  sourceWallet: {
    select: {
      id: true,
      name: true,
      currency: true,
      icon: true,
      color: true,
    },
  },
  destinationWallet: {
    select: {
      id: true,
      name: true,
      currency: true,
      icon: true,
      color: true,
    },
  },
} satisfies Prisma.TransferSelect;

type TransferRecord = Prisma.TransferGetPayload<{
  select: typeof transferSelect;
}>;

export type RepositoryTransaction = Prisma.TransactionClient;

function toTransferResponse(transfer: TransferRecord): TransferResponseDto {
  return {
    ...transfer,
    amount: transfer.amount.toFixed(2),
  };
}

function client(transaction?: RepositoryTransaction) {
  return transaction ?? prisma;
}

export class TransferRepository {
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

        if (!shouldRetry) throw error;
      }
    }

    throw new Error('Serializable transaction retry limit reached');
  }

  async findAll(userId: string, query: TransferQueryDto) {
    const {
      search,
      walletId,
      dateFrom,
      dateTo,
      sortBy,
      order,
      page,
      limit,
    } = query;
    const where: Prisma.TransferWhereInput = {
      userId,
      AND: [
        ...(walletId
          ? [{
          OR: [
            { sourceWalletId: walletId },
            { destinationWalletId: walletId },
          ],
          }]
          : []),
        ...(search
          ? [{
            OR: [
              { note: { contains: search, mode: Prisma.QueryMode.insensitive } },
              {
                sourceWallet: {
                  name: { contains: search, mode: Prisma.QueryMode.insensitive },
                },
              },
              {
                destinationWallet: {
                  name: { contains: search, mode: Prisma.QueryMode.insensitive },
                },
              },
            ],
          }]
          : []),
      ],
      ...(dateFrom || dateTo
        ? {
          transferredAt: {
            ...(dateFrom ? { gte: dateFrom } : {}),
            ...(dateTo ? { lte: dateTo } : {}),
          },
        }
        : {}),
    };
    const skip = (page - 1) * limit;

    const [transfers, total] = await prisma.$transaction([
      prisma.transfer.findMany({
        where,
        select: transferSelect,
        orderBy: [
          { [sortBy]: order },
          { id: order },
        ],
        skip,
        take: limit,
      }),
      prisma.transfer.count({ where }),
    ]);

    return {
      data: transfers.map(toTransferResponse),
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
    const transfer = await client(transaction).transfer.findFirst({
      where: { id, userId },
      select: transferSelect,
    });

    return transfer ? toTransferResponse(transfer) : null;
  }

  findWallets(
    userId: string,
    walletIds: string[],
    transaction: RepositoryTransaction,
  ) {
    return transaction.wallet.findMany({
      where: {
        userId,
        id: { in: walletIds },
      },
      select: {
        id: true,
        balance: true,
        currency: true,
        isArchived: true,
      },
    });
  }

  async create(
    userId: string,
    data: CreateTransferDto,
    transaction: RepositoryTransaction,
  ) {
    const created = await transaction.transfer.create({
      data: {
        userId,
        sourceWalletId: data.sourceWalletId,
        destinationWalletId: data.destinationWalletId,
        amount: data.amount,
        note: data.note,
        transferredAt: data.transferredAt,
      },
      select: transferSelect,
    });

    return toTransferResponse(created);
  }

  debitWallet(
    userId: string,
    walletId: string,
    amount: Prisma.Decimal,
    transaction: RepositoryTransaction,
  ) {
    return transaction.wallet.updateMany({
      where: {
        id: walletId,
        userId,
        isArchived: false,
        balance: { gte: amount },
      },
      data: { balance: { decrement: amount } },
    });
  }

  incrementWallet(
    walletId: string,
    amount: Prisma.Decimal,
    transaction: RepositoryTransaction,
  ) {
    return transaction.wallet.update({
      where: { id: walletId },
      data: { balance: { increment: amount } },
      select: { id: true },
    });
  }

  decrementWallet(
    walletId: string,
    amount: Prisma.Decimal,
    transaction: RepositoryTransaction,
  ) {
    return transaction.wallet.update({
      where: { id: walletId },
      data: { balance: { decrement: amount } },
      select: { id: true },
    });
  }

  delete(id: string, transaction: RepositoryTransaction) {
    return transaction.transfer.delete({
      where: { id },
      select: { id: true },
    });
  }
}
