import { Prisma } from '@prisma/client';
import { AppError } from '../../common/errors/app-error';
import { ERROR_CODE } from '../../common/errors/error-code';
import { cacheService } from '../../common/services/cache.service';
import { CreateTransferDto, TransferQueryDto } from './transfer.dto';
import {
  RepositoryTransaction,
  TransferRepository,
} from './transfer.repository';

export class TransferService {
  private readonly repository = new TransferRepository();

  findAll(userId: string, query: TransferQueryDto) {
    return this.repository.findAll(userId, query);
  }

  async create(userId: string, data: CreateTransferDto) {
    const created = await this.repository.runSerializable(async (transaction) => {
      if (data.sourceWalletId === data.destinationWalletId) {
        throw new AppError(
          'Source and destination wallets must be different',
          409,
          ERROR_CODE.TRANSFER_WALLETS_SAME,
        );
      }

      const [sourceWallet, destinationWallet] = await this.getTransferWallets(
        userId,
        data.sourceWalletId,
        data.destinationWalletId,
        transaction,
      );

      if (sourceWallet.isArchived || destinationWallet.isArchived) {
        throw new AppError(
          'Archived wallets cannot be used for transfers',
          409,
          ERROR_CODE.WALLET_ARCHIVED,
        );
      }

      if (sourceWallet.currency !== destinationWallet.currency) {
        throw new AppError(
          'Source and destination wallets must use the same currency',
          409,
          ERROR_CODE.TRANSFER_CURRENCY_MISMATCH,
        );
      }

      const amount = new Prisma.Decimal(data.amount);
      if (sourceWallet.balance.lessThan(amount)) {
        throw new AppError(
          'Source wallet has insufficient balance',
          409,
          ERROR_CODE.INSUFFICIENT_BALANCE,
        );
      }

      const debitResult = await this.repository.debitWallet(
        userId,
        sourceWallet.id,
        amount,
        transaction,
      );
      if (debitResult.count !== 1) {
        throw new AppError(
          'Source wallet has insufficient balance',
          409,
          ERROR_CODE.INSUFFICIENT_BALANCE,
        );
      }

      await this.repository.incrementWallet(
        destinationWallet.id,
        amount,
        transaction,
      );

      return this.repository.create(userId, data, transaction);
    });

    await this.invalidateReportCache(userId);
    return created;
  }

  async delete(userId: string, id: string) {
    const deleted = await this.repository.runSerializable(async (transaction) => {
      const current = await this.repository.findById(userId, id, transaction);
      if (!current) {
        throw new AppError('Transfer not found', 404, ERROR_CODE.NOT_FOUND);
      }

      const [sourceWallet, destinationWallet] = await this.getTransferWallets(
        userId,
        current.sourceWalletId,
        current.destinationWalletId,
        transaction,
      );

      if (sourceWallet.isArchived || destinationWallet.isArchived) {
        throw new AppError(
          'Archived wallets cannot be modified',
          409,
          ERROR_CODE.WALLET_ARCHIVED,
        );
      }

      const amount = new Prisma.Decimal(current.amount);

      if (destinationWallet.balance.lessThan(amount)) {
        throw new AppError(
          'Destination wallet has insufficient balance to reverse transfer',
          409,
          ERROR_CODE.INSUFFICIENT_BALANCE,
        );
      }

      const debitResult = await this.repository.debitWallet(
        userId,
        destinationWallet.id,
        amount,
        transaction,
      );
      if (debitResult.count !== 1) {
        throw new AppError(
          'Destination wallet has insufficient balance to reverse transfer',
          409,
          ERROR_CODE.INSUFFICIENT_BALANCE,
        );
      }

      await this.repository.incrementWallet(sourceWallet.id, amount, transaction);
      await this.repository.delete(id, transaction);

      return current;
    });

    await this.invalidateReportCache(userId);
    return deleted;
  }

  private async getTransferWallets(
    userId: string,
    sourceWalletId: string,
    destinationWalletId: string,
    transaction: RepositoryTransaction,
  ) {
    const wallets = await this.repository.findWallets(
      userId,
      [sourceWalletId, destinationWalletId],
      transaction,
    );
    const sourceWallet = wallets.find((wallet) => wallet.id === sourceWalletId);
    const destinationWallet = wallets.find((wallet) => wallet.id === destinationWalletId);

    if (!sourceWallet || !destinationWallet) {
      throw new AppError('Wallet not found', 404, ERROR_CODE.NOT_FOUND);
    }

    return [sourceWallet, destinationWallet] as const;
  }

  private async invalidateReportCache(userId: string): Promise<void> {
    await cacheService.clearPattern(`finwise:cache:reports:${userId}:*`);
  }
}
