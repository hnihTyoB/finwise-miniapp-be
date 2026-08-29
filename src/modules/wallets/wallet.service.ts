import { Prisma } from '@prisma/client';
import { AppError } from '../../common/errors/app-error';
import { ERROR_CODE } from '../../common/errors/error-code';
import { CreateWalletDto, UpdateWalletDto, WalletQueryDto } from './wallet.dto';
import { WalletRepository } from './wallet.repository';
import { cacheService } from '../../common/services/cache.service';

export class WalletService {
  private readonly repository = new WalletRepository();

  findAll(userId: string, query: WalletQueryDto) {
    return this.repository.findAll(userId, query);
  }

  async findById(userId: string, id: string) {
    const wallet = await this.repository.findById(userId, id);

    if (!wallet) {
      throw new AppError('Wallet not found', 404, ERROR_CODE.NOT_FOUND);
    }

    return wallet;
  }

  async create(userId: string, data: CreateWalletDto) {
    await this.ensureUniqueName(userId, data.name);

    try {
      const wallet = await this.repository.create(userId, data);
      await this.invalidateReportCache(userId);
      return wallet;
    } catch (error) {
      this.handleUniqueConstraint(error);
      throw error;
    }
  }

  async update(userId: string, id: string, data: UpdateWalletDto) {
    await this.findById(userId, id);

    if (data.name !== undefined) {
      await this.ensureUniqueName(userId, data.name, id);
    }

    try {
      const wallet = await this.repository.update(id, data);
      await this.invalidateReportCache(userId);
      return wallet;
    } catch (error) {
      this.handleUniqueConstraint(error);
      throw error;
    }
  }

  async setDefault(userId: string, id: string) {
    const wallet = await this.findById(userId, id);

    if (wallet.isArchived) {
      throw new AppError('Archived wallet cannot be set as default', 409, ERROR_CODE.WALLET_ARCHIVED);
    }

    if (wallet.isDefault) {
      return wallet;
    }

    const updatedWallet = await this.repository.setDefault(userId, id);

    if (!updatedWallet) {
      throw new AppError('Archived wallet cannot be set as default', 409, ERROR_CODE.WALLET_ARCHIVED);
    }

    await this.invalidateReportCache(userId);
    return updatedWallet;
  }

  async archive(userId: string, id: string) {
    const wallet = await this.findById(userId, id);

    if (wallet.isArchived) {
      return wallet;
    }

    if (wallet.isDefault) {
      throw new AppError(
        'Set another wallet as default before archiving this wallet',
        409,
        ERROR_CODE.DEFAULT_WALLET_REQUIRED,
      );
    }

    const archivedWallet = await this.repository.archive(userId, id);

    if (!archivedWallet) {
      throw new AppError(
        'Set another wallet as default before archiving this wallet',
        409,
        ERROR_CODE.DEFAULT_WALLET_REQUIRED,
      );
    }

    await this.invalidateReportCache(userId);
    return archivedWallet;
  }

  async restore(userId: string, id: string) {
    const wallet = await this.findById(userId, id);

    if (!wallet.isArchived) {
      return wallet;
    }

    const restoredWallet = await this.repository.restore(userId, id);
    await this.invalidateReportCache(userId);
    return restoredWallet;
  }

  private async ensureUniqueName(userId: string, name: string, excludeId?: string) {
    const wallet = await this.repository.findByName(userId, name, excludeId);

    if (wallet) {
      throw new AppError('Wallet name already exists', 409, ERROR_CODE.DUPLICATE_ENTRY);
    }
  }

  private handleUniqueConstraint(error: unknown): void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError('Wallet name already exists', 409, ERROR_CODE.DUPLICATE_ENTRY);
    }
  }

  private async invalidateReportCache(userId: string): Promise<void> {
    await cacheService.clearPattern(`finwise:cache:reports:${userId}:*`);
  }
}
