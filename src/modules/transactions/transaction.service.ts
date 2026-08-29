import { Prisma, TransactionType } from '@prisma/client';
import { AppError } from '../../common/errors/app-error';
import { ERROR_CODE } from '../../common/errors/error-code';
import { NotificationService } from '../notifications/notification.service';
import { ReceiptFileService, StoredReceipt } from './receipt-file.service';
import { cacheService } from '../../common/services/cache.service';
import { webhookService } from '../webhooks/webhook.service';
import {
  CreateTransactionDto,
  TransactionQueryDto,
  UpdateTransactionDto,
} from './transaction.dto';
import {
  RepositoryTransaction,
  TransactionRepository,
} from './transaction.repository';

export class TransactionService {
  private readonly repository = new TransactionRepository();
  private readonly receiptFiles = new ReceiptFileService();
  private readonly notificationService = new NotificationService();

  findAll(userId: string, query: TransactionQueryDto) {
    return this.repository.findAll(userId, query);
  }

  async findById(userId: string, id: string) {
    const transaction = await this.repository.findById(userId, id);

    if (!transaction) {
      throw new AppError('Transaction not found', 404, ERROR_CODE.NOT_FOUND);
    }

    return transaction;
  }

  async create(userId: string, data: CreateTransactionDto) {
    const created = await this.repository.runSerializable(async (transaction) => {
      await this.ensureValidRelations(
        userId,
        data.walletId,
        data.categoryId,
        data.type,
        transaction,
      );

      const created = await this.repository.create(userId, data, transaction);
      await this.repository.adjustWalletBalance(
        data.walletId,
        new Prisma.Decimal(data.amount),
        data.type,
        'APPLY',
        transaction,
      );

      return created;
    });

    await this.notificationService.detectUnusualTransaction(userId, created);
    await this.invalidateReportCache(userId);

    // Tự động phát tán event qua Webhook callback của User
    webhookService
      .dispatchEventToUser(userId, 'transaction.created', {
        id: created.id,
        walletId: created.walletId,
        categoryId: created.categoryId,
        amount: created.amount.toString(),
        type: created.type,
        date: created.date,
        description: created.description,
        createdAt: created.createdAt,
      })
      .catch((err) => console.error('[Webhook] Failed to dispatch transaction.created:', err));

    return created;
  }

  async update(userId: string, id: string, data: UpdateTransactionDto) {
    const updated = await this.repository.runSerializable(async (transaction) => {
      const current = await this.repository.findById(userId, id, transaction);
      if (!current) {
        throw new AppError('Transaction not found', 404, ERROR_CODE.NOT_FOUND);
      }

      const nextWalletId = data.walletId ?? current.walletId;
      const nextCategoryId = data.categoryId ?? current.categoryId;
      const nextType = data.type ?? current.type;
      const nextAmount = new Prisma.Decimal(data.amount ?? current.amount);
      const financialDataChanged = nextWalletId !== current.walletId
        || nextType !== current.type
        || !nextAmount.equals(current.amount);
      const currentWallet = await this.repository.findWallet(
        userId,
        current.walletId,
        transaction,
      );
      if (!currentWallet) {
        throw new AppError('Wallet not found', 404, ERROR_CODE.NOT_FOUND);
      }

      await this.ensureValidRelations(
        userId,
        nextWalletId,
        nextCategoryId,
        nextType,
        transaction,
      );

      if (financialDataChanged) {
        await this.repository.adjustWalletBalance(
          current.walletId,
          new Prisma.Decimal(current.amount),
          current.type,
          'REVERSE',
          transaction,
        );
        await this.repository.adjustWalletBalance(
          nextWalletId,
          nextAmount,
          nextType,
          'APPLY',
          transaction,
        );
      }

      return this.repository.update(id, data, transaction);
    });

    await this.notificationService.detectUnusualTransaction(userId, updated);
    await this.invalidateReportCache(userId);
    return updated;
  }

  async delete(userId: string, id: string) {
    const deleted = await this.repository.runSerializable(async (transaction) => {
      const current = await this.repository.findById(userId, id, transaction);
      if (!current) {
        throw new AppError('Transaction not found', 404, ERROR_CODE.NOT_FOUND);
      }

      const wallet = await this.repository.findWallet(
        userId,
        current.walletId,
        transaction,
      );
      if (!wallet) {
        throw new AppError('Wallet not found', 404, ERROR_CODE.NOT_FOUND);
      }

      await this.repository.adjustWalletBalance(
        current.walletId,
        new Prisma.Decimal(current.amount),
        current.type,
        'REVERSE',
        transaction,
      );

      return this.repository.delete(id, transaction);
    });

    await this.receiptFiles.remove(deleted.receiptUrl);
    await this.invalidateReportCache(userId);
    return { id: deleted.id };
  }

  async uploadReceipt(
    userId: string,
    id: string,
    file: Express.Multer.File,
  ) {
    await this.findById(userId, id);
    const receiptKey = await this.receiptFiles.save(userId, file);

    try {
      const result = await this.repository.replaceReceipt(userId, id, receiptKey);
      if (!result) {
        throw new AppError('Transaction not found', 404, ERROR_CODE.NOT_FOUND);
      }

      await this.receiptFiles.remove(result.previousReceiptKey);
      await this.invalidateReportCache(userId);
      return result.transaction;
    } catch (error) {
      await this.receiptFiles.remove(receiptKey);
      throw error;
    }
  }

  async getReceipt(userId: string, id: string): Promise<StoredReceipt> {
    const transaction = await this.repository.findStoredReceipt(userId, id);

    if (!transaction) {
      throw new AppError('Transaction not found', 404, ERROR_CODE.NOT_FOUND);
    }

    if (!transaction.receiptUrl) {
      throw new AppError('Receipt not found', 404, ERROR_CODE.RECEIPT_NOT_FOUND);
    }

    return this.receiptFiles.resolve(transaction.receiptUrl);
  }

  async deleteReceipt(userId: string, id: string) {
    const result = await this.repository.replaceReceipt(userId, id, null);
    if (!result) {
      throw new AppError('Transaction not found', 404, ERROR_CODE.NOT_FOUND);
    }

    if (!result.previousReceiptKey) {
      throw new AppError('Receipt not found', 404, ERROR_CODE.RECEIPT_NOT_FOUND);
    }

    await this.receiptFiles.remove(result.previousReceiptKey);
    await this.invalidateReportCache(userId);
    return result.transaction;
  }

  private async ensureValidRelations(
    userId: string,
    walletId: string,
    categoryId: string,
    type: TransactionType,
    transaction: RepositoryTransaction,
  ) {
    const [wallet, category] = await Promise.all([
      this.repository.findWallet(userId, walletId, transaction),
      this.repository.findCategory(userId, categoryId, transaction),
    ]);

    if (!wallet) {
      throw new AppError('Wallet not found', 404, ERROR_CODE.NOT_FOUND);
    }

    if (wallet.isArchived) {
      throw new AppError(
        'Archived wallet cannot be used for transactions',
        409,
        ERROR_CODE.WALLET_ARCHIVED,
      );
    }

    if (!category) {
      throw new AppError('Category not found', 404, ERROR_CODE.NOT_FOUND);
    }

    if (category.isArchived) {
      throw new AppError(
        'Archived category cannot be used for transactions',
        409,
        ERROR_CODE.CATEGORY_ARCHIVED,
      );
    }

    if (category.type !== type) {
      throw new AppError(
        'Transaction type must match category type',
        409,
        ERROR_CODE.TRANSACTION_CATEGORY_TYPE_MISMATCH,
      );
    }
  }

  private async invalidateReportCache(userId: string): Promise<void> {
    await Promise.all([
      cacheService.clearPattern(`finwise:cache:reports:${userId}:*`),
      cacheService.clearPattern(`finwise:cache:forecast:${userId}:*`),
    ]);
  }
}
