import { Prisma, TransactionType } from '@prisma/client';
import { AppError } from '../../../common/errors/app-error';
import { ERROR_CODE } from '../../../common/errors/error-code';
import {
  businessDateToPrismaDate,
  instantToBusinessDate,
} from '../../../common/date-time/business-time';
import { EarlySettlementDto, PayInstallmentDto } from '../debt.dto';
import { DebtRepository } from '../debt.repository';
import { cacheService } from '../../../common/services/cache.service';
import { webhookService } from '../../webhooks/webhook.service';

export class DebtSettlementService {
  private readonly debtRepository = new DebtRepository();

  private async invalidateReportCache(userId: string): Promise<void> {
    await Promise.all([
      cacheService.clearPattern(`finwise:cache:reports:${userId}:*`),
      cacheService.clearPattern(`finwise:cache:forecast:${userId}:*`),
    ]);
  }

  /**
   * Thanh toán nguyên tử một kỳ nợ cụ thể (Atomic Split Settlement)
   * 1. Kiểm tra trạng thái kỳ nợ và hợp đồng
   * 2. Trừ/Cộng tiền ví theo tổng số tiền kỳ hạn (Gốc + Lãi)
   * 3. Ghi nhận giao dịch P&L cho phần Lãi (Chi phí lãi hoặc Thu nhập lãi)
   * 4. Cập nhật giảm nghĩa vụ nợ gốc trên Hợp đồng và Kỳ thanh toán
   */
  public async payInstallment(
    userId: string,
    debtContractId: string,
    period: number,
    dto: PayInstallmentDto,
  ) {
    const result = await this.debtRepository.runSerializable(async (tx) => {
      let createdInterestTx: {
        id: string;
        walletId: string;
        categoryId: string;
        amount: string;
        type: TransactionType;
        date: Date;
        description: string;
      } | null = null;

      // 1. Tìm hợp đồng nợ và kỳ thanh toán
      const contract = await this.debtRepository.findContractWithInstallment(
        debtContractId,
        userId,
        period,
        tx,
      );

      if (!contract || contract.isArchived) {
        throw new AppError('Khoản nợ không tồn tại hoặc đã bị lưu trữ', 404, ERROR_CODE.DEBT_NOT_FOUND);
      }

      const installment = contract.scheduleItems[0];
      if (!installment) {
        throw new AppError(`Không tìm thấy kỳ số ${period} trong hợp đồng nợ`, 404, ERROR_CODE.DEBT_SCHEDULE_ITEM_NOT_FOUND);
      }

      if (installment.status === 'PAID') {
        throw new AppError(`Kỳ số ${period} đã được thanh toán trước đó`, 409, ERROR_CODE.DUPLICATE_ENTRY);
      }

      if (installment.status === 'WAIVED') {
        throw new AppError(`Kỳ số ${period} đã được miễn trừ nghĩa vụ thanh toán`, 400, ERROR_CODE.DEBT_ALREADY_COMPLETED);
      }

      // 2. Xác định và kiểm tra ví thanh toán (có fallback về ví mặc định nếu hợp đồng chưa gán ví)
      let targetWalletId = dto.walletId || contract.walletId;
      if (!targetWalletId) {
        const defaultWallet = await this.debtRepository.findUserDefaultWallet(userId, tx);
        if (defaultWallet) {
          targetWalletId = defaultWallet.id;
        }
      }

      if (!targetWalletId) {
        throw new AppError('Vui lòng chỉ định ví thanh toán cho kỳ nợ này', 400, ERROR_CODE.DEFAULT_WALLET_REQUIRED);
      }

      const wallet = await this.debtRepository.findWallet(targetWalletId, userId, tx);

      if (!wallet || wallet.isArchived) {
        throw new AppError('Ví thanh toán không tồn tại hoặc đã bị lưu trữ', 400, ERROR_CODE.WALLET_ARCHIVED);
      }

      // 3. Biến động số dư ví (Balance Adjustment)
      if (contract.type === 'DEBT_PAYABLE') {
        // Người dùng đi vay -> Trả tiền ra khỏi ví
        if (wallet.balance.lessThan(installment.totalDue)) {
          throw new AppError('Số dư ví không đủ để thanh toán kỳ nợ này', 400, ERROR_CODE.INSUFFICIENT_BALANCE);
        }

        await this.debtRepository.updateWalletBalance(wallet.id, installment.totalDue, 'decrement', tx);
      } else {
        // Người dùng cho vay -> Thu hồi tiền nợ vào ví
        await this.debtRepository.updateWalletBalance(wallet.id, installment.totalDue, 'increment', tx);
      }

      // 4. Hạch toán phần Lãi vào P&L (nếu có phát sinh lãi > 0)
      let interestTransactionId: string | null = null;
      const paidDateBusiness = dto.paidDate || instantToBusinessDate(new Date());
      const paidPrismaDate = businessDateToPrismaDate(paidDateBusiness);

      if (installment.interestDue.greaterThan(0)) {
        const transactionType =
          contract.type === 'DEBT_PAYABLE' ? TransactionType.EXPENSE : TransactionType.INCOME;

        const category = await this.debtRepository.getOrCreateInterestCategory(userId, transactionType, tx);

        const interestDescription =
          contract.type === 'DEBT_PAYABLE'
            ? `Lãi vay kỳ ${installment.period}: ${contract.name} (${contract.counterparty})`
            : `Lãi cho vay kỳ ${installment.period}: ${contract.name} (${contract.counterparty})`;

        const interestTx = await this.debtRepository.createInterestTransaction(
          {
            userId,
            walletId: wallet.id,
            categoryId: category.id,
            amount: installment.interestDue,
            type: transactionType,
            date: paidPrismaDate,
            description: interestDescription,
          },
          tx,
        );

        interestTransactionId = interestTx.id;
        createdInterestTx = {
          id: interestTx.id,
          walletId: wallet.id,
          categoryId: category.id,
          amount: installment.interestDue.toString(),
          type: transactionType,
          date: paidPrismaDate,
          description: interestDescription,
        };
      }

      // 5. Cập nhật trạng thái Kỳ nợ (Schedule Item)
      const updatedInstallment = await this.debtRepository.updateInstallmentPaid(
        installment.id,
        {
          principalPaid: installment.principalDue,
          interestPaid: installment.interestDue,
          paidAt: new Date(),
          transactionId: interestTransactionId,
          notes: dto.notes,
        },
        tx,
      );

      // 6. Cập nhật Dư nợ gốc trên Hợp đồng (Liability Reduction)
      const newRemaining = Prisma.Decimal.max(
        new Prisma.Decimal(0),
        contract.remainingPrincipal.minus(installment.principalDue),
      );

      // Kiểm tra xem còn kỳ nào chưa thanh toán không
      const unpaidCount = await this.debtRepository.countUnpaidScheduleItems(
        contract.id,
        installment.id,
        tx,
      );

      const isFullySettled = newRemaining.equals(0) || unpaidCount === 0;

      const updatedContract = await this.debtRepository.updateContractSettlement(
        contract.id,
        {
          remainingPrincipal: newRemaining,
          status: isFullySettled ? 'COMPLETED' : contract.status,
        },
        tx,
      );

      return {
        installment: updatedInstallment,
        contract: updatedContract,
        settlementDetails: {
          principalPaid: installment.principalDue.toNumber(),
          interestPaid: installment.interestDue.toNumber(),
          totalAmountPaid: installment.totalDue.toNumber(),
          walletId: wallet.id,
          interestTransactionId,
          isFullySettled,
        },
        createdInterestTx,
      };
    });

    // Invalidate report/forecast cache & dispatch webhook event
    await this.invalidateReportCache(userId);

    if (result.createdInterestTx) {
      const txPayload = result.createdInterestTx;
      webhookService
        .dispatchEventToUser(userId, 'transaction.created', {
          id: txPayload.id,
          walletId: txPayload.walletId,
          categoryId: txPayload.categoryId,
          amount: txPayload.amount,
          type: txPayload.type,
          date: txPayload.date,
          description: txPayload.description,
          createdAt: new Date(),
        })
        .catch((err) => console.error('[Webhook] Failed to dispatch debt interest transaction.created:', err));
    }

    return {
      installment: result.installment,
      contract: result.contract,
      settlementDetails: result.settlementDetails,
    };
  }

  /**
   * Tất toán toàn bộ khoản nợ trước hạn (Early Settlement)
   * - Thanh toán trọn vẹn dư nợ gốc còn lại + Phí phạt tất toán trước hạn (nếu có)
   * - Toàn bộ lãi các kỳ tương lai được miễn trừ (chuyển sang WAIVED)
   * - Đóng hợp đồng sang COMPLETED
   */
  public async settleEarly(
    userId: string,
    debtContractId: string,
    dto: EarlySettlementDto,
  ) {
    const result = await this.debtRepository.runSerializable(async (tx) => {
      let createdPenaltyTx: {
        id: string;
        walletId: string;
        categoryId: string;
        amount: string;
        type: TransactionType;
        date: Date;
        description: string;
      } | null = null;

      const contract = await this.debtRepository.findContractForEarlySettlement(
        debtContractId,
        userId,
        tx,
      );

      if (!contract || contract.isArchived) {
        throw new AppError('Khoản nợ không tồn tại hoặc đã bị lưu trữ', 404, ERROR_CODE.DEBT_NOT_FOUND);
      }

      if (contract.status === 'COMPLETED') {
        throw new AppError('Khoản nợ này đã được tất toán trước đó', 400, ERROR_CODE.DEBT_ALREADY_COMPLETED);
      }

      const remainingPrincipal = contract.remainingPrincipal;
      const penaltyFee = new Prisma.Decimal(dto.penaltyFee || 0);
      const totalAmountToPay = remainingPrincipal.add(penaltyFee);

      // Xác thực ví thanh toán (có fallback về ví mặc định nếu hợp đồng chưa gán ví)
      let targetWalletId = dto.walletId || contract.walletId;
      if (!targetWalletId) {
        const defaultWallet = await this.debtRepository.findUserDefaultWallet(userId, tx);
        if (defaultWallet) {
          targetWalletId = defaultWallet.id;
        }
      }

      if (!targetWalletId) {
        throw new AppError('Vui lòng chỉ định ví thanh toán để tất toán', 400, ERROR_CODE.DEFAULT_WALLET_REQUIRED);
      }

      const wallet = await this.debtRepository.findWallet(targetWalletId, userId, tx);

      if (!wallet || wallet.isArchived) {
        throw new AppError('Ví thanh toán không tồn tại hoặc đã bị lưu trữ', 400, ERROR_CODE.WALLET_ARCHIVED);
      }

      // Điều chỉnh số dư ví
      if (contract.type === 'DEBT_PAYABLE') {
        if (wallet.balance.lessThan(totalAmountToPay)) {
          throw new AppError('Số dư ví không đủ để tất toán toàn bộ khoản nợ', 400, ERROR_CODE.INSUFFICIENT_BALANCE);
        }

        await this.debtRepository.updateWalletBalance(wallet.id, totalAmountToPay, 'decrement', tx);
      } else {
        await this.debtRepository.updateWalletBalance(wallet.id, totalAmountToPay, 'increment', tx);
      }

      // Nếu có phí phạt, ghi nhận vào P&L Expense
      const paidDateBusiness = dto.paidDate || instantToBusinessDate(new Date());
      const paidPrismaDate = businessDateToPrismaDate(paidDateBusiness);

      if (penaltyFee.greaterThan(0)) {
        const category = await this.debtRepository.getOrCreateInterestCategory(userId, TransactionType.EXPENSE, tx);
        const penaltyTx = await this.debtRepository.createInterestTransaction(
          {
            userId,
            walletId: wallet.id,
            categoryId: category.id,
            amount: penaltyFee,
            type: TransactionType.EXPENSE,
            date: paidPrismaDate,
            description: `Phí phạt tất toán trước hạn: ${contract.name} (${contract.counterparty})`,
          },
          tx,
        );

        createdPenaltyTx = {
          id: penaltyTx.id,
          walletId: wallet.id,
          categoryId: category.id,
          amount: penaltyFee.toString(),
          type: TransactionType.EXPENSE,
          date: paidPrismaDate,
          description: `Phí phạt tất toán trước hạn: ${contract.name} (${contract.counterparty})`,
        };
      }

      // Đánh dấu toàn bộ các kỳ tương lai chưa trả là WAIVED (miễn lãi và nghĩa vụ)
      await this.debtRepository.waiveFutureScheduleItems(contract.id, 'Miễn trừ do tất toán trước hạn', tx);

      // Đóng hợp đồng nợ
      const updatedContract = await this.debtRepository.updateContractSettlement(
        contract.id,
        {
          remainingPrincipal: new Prisma.Decimal(0),
          status: 'COMPLETED',
        },
        tx,
      );

      return {
        contract: updatedContract,
        settlementDetails: {
          principalSettled: remainingPrincipal.toNumber(),
          penaltyFee: penaltyFee.toNumber(),
          totalAmountPaid: totalAmountToPay.toNumber(),
          walletId: wallet.id,
          status: 'COMPLETED',
        },
        createdPenaltyTx,
      };
    });

    // Invalidate report/forecast cache & dispatch webhook event
    await this.invalidateReportCache(userId);

    if (result.createdPenaltyTx) {
      const txPayload = result.createdPenaltyTx;
      webhookService
        .dispatchEventToUser(userId, 'transaction.created', {
          id: txPayload.id,
          walletId: txPayload.walletId,
          categoryId: txPayload.categoryId,
          amount: txPayload.amount,
          type: txPayload.type,
          date: txPayload.date,
          description: txPayload.description,
          createdAt: new Date(),
        })
        .catch((err) => console.error('[Webhook] Failed to dispatch debt penalty fee transaction.created:', err));
    }

    return {
      contract: result.contract,
      settlementDetails: result.settlementDetails,
    };
  }
}
