import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.client';
import {
  CreateWalletDto,
  UpdateWalletDto,
  WalletQueryDto,
  WalletResponseDto,
} from './wallet.dto';

const walletSelect = {
  id: true,
  name: true,
  balance: true,
  currency: true,
  icon: true,
  color: true,
  description: true,
  isDefault: true,
  isArchived: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.WalletSelect;

type WalletRecord = Prisma.WalletGetPayload<{ select: typeof walletSelect }>;

function toWalletResponse(wallet: WalletRecord): WalletResponseDto {
  return {
    ...wallet,
    balance: wallet.balance.toFixed(2),
  };
}

async function runSerializableTransaction<T>(
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
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

export class WalletRepository {
  async findAll(userId: string, query: WalletQueryDto) {
    const { includeArchived, sortBy, order, page, limit } = query;
    const where: Prisma.WalletWhereInput = {
      userId,
      ...(includeArchived ? {} : { isArchived: false }),
    };
    const skip = (page - 1) * limit;

    const [wallets, total] = await prisma.$transaction([
      prisma.wallet.findMany({
        where,
        select: walletSelect,
        orderBy: { [sortBy]: order },
        skip,
        take: limit,
      }),
      prisma.wallet.count({ where }),
    ]);

    return {
      data: wallets.map(toWalletResponse),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findById(userId: string, id: string) {
    const wallet = await prisma.wallet.findFirst({
      where: { id, userId },
      select: walletSelect,
    });

    return wallet ? toWalletResponse(wallet) : null;
  }

  findByName(userId: string, name: string, excludeId?: string) {
    return prisma.wallet.findFirst({
      where: {
        userId,
        name,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
  }

  async create(userId: string, data: CreateWalletDto) {
    const wallet = await runSerializableTransaction(async (transaction) => {
      const activeWalletCount = await transaction.wallet.count({
        where: { userId, isArchived: false },
      });
      const shouldBeDefault = data.isDefault === true || activeWalletCount === 0;

      if (shouldBeDefault) {
        await transaction.wallet.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return transaction.wallet.create({
        data: {
          userId,
          name: data.name,
          balance: data.balance,
          currency: data.currency,
          icon: data.icon,
          color: data.color,
          description: data.description,
          isDefault: shouldBeDefault,
        },
        select: walletSelect,
      });
    });

    return toWalletResponse(wallet);
  }

  async update(id: string, data: UpdateWalletDto) {
    const wallet = await prisma.wallet.update({
      where: { id },
      data,
      select: walletSelect,
    });

    return toWalletResponse(wallet);
  }

  async setDefault(userId: string, id: string) {
    const wallet = await runSerializableTransaction(async (transaction) => {
      const targetWallet = await transaction.wallet.findFirst({
        where: { id, userId, isArchived: false },
        select: { id: true },
      });

      if (!targetWallet) {
        return null;
      }

      await transaction.wallet.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });

      return transaction.wallet.update({
        where: { id },
        data: { isDefault: true },
        select: walletSelect,
      });
    });

    return wallet ? toWalletResponse(wallet) : null;
  }

  async archive(userId: string, id: string) {
    const wallet = await runSerializableTransaction(async (transaction) => {
      const targetWallet = await transaction.wallet.findFirst({
        where: { id, userId },
        select: walletSelect,
      });

      if (!targetWallet || targetWallet.isDefault) {
        return null;
      }

      if (targetWallet.isArchived) {
        return targetWallet;
      }

      return transaction.wallet.update({
        where: { id },
        data: { isArchived: true },
        select: walletSelect,
      });
    });

    return wallet ? toWalletResponse(wallet) : null;
  }

  async restore(userId: string, id: string) {
    const wallet = await runSerializableTransaction(async (transaction) => {
      const defaultWallet = await transaction.wallet.findFirst({
        where: { userId, isDefault: true, isArchived: false },
        select: { id: true },
      });

      return transaction.wallet.update({
        where: { id },
        data: {
          isArchived: false,
          isDefault: defaultWallet === null,
        },
        select: walletSelect,
      });
    });

    return toWalletResponse(wallet);
  }
}
