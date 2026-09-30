import { Prisma, TransactionType } from '@prisma/client';
import { prisma } from '../../../database/prisma.client';
import { AppError } from '../../../common/errors/app-error';
import { ERROR_CODE } from '../../../common/errors/error-code';
import {
  businessDateToPrismaDate,
  instantToBusinessDate,
} from '../../../common/date-time/business-time';
import { EarlySettlementDto, PayInstallmentDto } from '../debt.dto';

export class DebtSettlementService {
  /**
   * Tìm hoặc tự động khởi tạo danh mục chi phí/thu nhập lãi vay
   */
  private async getOrCreateInterestCategory(
    userId: string,
    type: TransactionType,
    tx: Prisma.TransactionClient,
  ) {
    const categoryName =
      type === TransactionType.EXPENSE ? 'Chi phí lãi vay' : 'Thu nhập lãi cho vay';

    // 1. Tìm danh mục người dùng hoặc hệ thống đã có
    const existing = await tx.category.findFirst({
      where: {
        name: categoryName,
        type,
        isArchived: false,
        OR: [{ userId }, { isSystem: true, userId: null }],
      },
      select: { id: true },
    });

    if (existing) {
      return existing;
    }

    // 2. Tự động khởi tạo nếu chưa có
    return tx.category.create({
      data: {
        userId,
        name: categoryName,
        type,
        isSystem: false,
        icon: type === TransactionType.EXPENSE ? 'percent' : 'trending-up',
        color: type === TransactionType.EXPENSE ? '#EF4444' : '#10B981',
      },
      select: { id: true },
    });
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
    return prisma.$transaction(
      async (tx) => {
        // 1. Tìm hợp đồng nợ và kỳ thanh toán
        const contract = await tx.debtContract.findFirst({
          where: { id: debtContractId, userId },
          include: {
            scheduleItems: {
              where: { period },
            },
          },
        });

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

        // 2. Xác định và kiểm tra ví thanh toán
        const targetWalletId = dto.walletId || contract.walletId;
        if (!targetWalletId) {
          throw new AppError('Vui lòng chỉ định ví thanh toán cho kỳ nợ này', 400, ERROR_CODE.DEFAULT_WALLET_REQUIRED);
        }

        const wallet = await tx.wallet.findFirst({
          where: { id: targetWalletId, userId },
        });

        if (!wallet || wallet.isArchived) {
          throw new AppError('Ví thanh toán không tồn tại hoặc đã bị lưu trữ', 400, ERROR_CODE.WALLET_ARCHIVED);
        }

        // 3. Biến động số dư ví (Balance Adjustment)
        if (contract.type === 'DEBT_PAYABLE') {
          // Người dùng đi vay -> Trả tiền ra khỏi ví
          if (wallet.balance.lessThan(installment.totalDue)) {
            throw new AppError('Số dư ví không đủ để thanh toán kỳ nợ này', 400, ERROR_CODE.INSUFFICIENT_BALANCE);
          }

          await tx.wallet.update({
            where: { id: wallet.id },
            data: { balance: { decrement: installment.totalDue } },
          });
        } else {
          // Người dùng cho vay -> Thu hồi tiền nợ vào ví
          await tx.wallet.update({
            where: { id: wallet.id },
            data: { balance: { increment: installment.totalDue } },
          });
        }

        // 4. Hạch toán phần Lãi vào P&L (nếu có phát sinh lãi > 0)
        let interestTransactionId: string | null = null;
        const paidDateBusiness = dto.paidDate || instantToBusinessDate(new Date());
        const paidPrismaDate = businessDateToPrismaDate(paidDateBusiness);

        if (installment.interestDue.greaterThan(0)) {
          const transactionType =
            contract.type === 'DEBT_PAYABLE' ? TransactionType.EXPENSE : TransactionType.INCOME;

          const category = await this.getOrCreateInterestCategory(userId, transactionType, tx);

          const interestDescription =
            contract.type === 'DEBT_PAYABLE'
              ? `Lãi vay kỳ ${installment.period}: ${contract.name} (${contract.counterparty})`
              : `Lãi cho vay kỳ ${installment.period}: ${contract.name} (${contract.counterparty})`;

          const interestTx = await tx.transaction.create({
            data: {
              userId,
              walletId: wallet.id,
              categoryId: category.id,
              amount: installment.interestDue,
              type: transactionType,
              date: paidPrismaDate,
              description: interestDescription,
            },
            select: { id: true },
          });

          interestTransactionId = interestTx.id;
        }

        // 5. Cập nhật trạng thái Kỳ nợ (Schedule Item)
        const updatedInstallment = await tx.debtScheduleItem.update({
          where: { id: installment.id },
          data: {
            principalPaid: installment.principalDue,
            interestPaid: installment.interestDue,
            status: 'PAID',
            paidAt: new Date(),
            transactionId: interestTransactionId,
            ...(dto.notes && { notes: dto.notes }),
          },
        });

        // 6. Cập nhật Dư nợ gốc trên Hợp đồng (Liability Reduction)
        const newRemaining = Prisma.Decimal.max(
          new Prisma.Decimal(0),
          contract.remainingPrincipal.minus(installment.principalDue),
        );

        // Kiểm tra xem còn kỳ nào chưa thanh toán không
        const unpaidCount = await tx.debtScheduleItem.count({
          where: {
            debtContractId: contract.id,
            id: { not: installment.id },
            status: { notIn: ['PAID', 'WAIVED'] },
          },
        });

        const isFullySettled = newRemaining.equals(0) || unpaidCount === 0;

        const updatedContract = await tx.debtContract.update({
          where: { id: contract.id },
          data: {
            remainingPrincipal: newRemaining,
            status: isFullySettled ? 'COMPLETED' : contract.status,
          },
          select: {
            id: true,
            name: true,
            status: true,
            remainingPrincipal: true,
          },
        });

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
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
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
    return prisma.$transaction(
      async (tx) => {
        const contract = await tx.debtContract.findFirst({
          where: { id: debtContractId, userId },
          include: {
            scheduleItems: {
              where: { status: { notIn: ['PAID', 'WAIVED'] } },
            },
          },
        });

        if (!contract || contract.isArchived) {
          throw new AppError('Khoản nợ không tồn tại hoặc đã bị lưu trữ', 404, ERROR_CODE.DEBT_NOT_FOUND);
        }

        if (contract.status === 'COMPLETED') {
          throw new AppError('Khoản nợ này đã được tất toán trước đó', 400, ERROR_CODE.DEBT_ALREADY_COMPLETED);
        }

        const remainingPrincipal = contract.remainingPrincipal;
        const penaltyFee = new Prisma.Decimal(dto.penaltyFee || 0);
        const totalAmountToPay = remainingPrincipal.add(penaltyFee);

        // Xác thực ví thanh toán
        const targetWalletId = dto.walletId || contract.walletId;
        if (!targetWalletId) {
          throw new AppError('Vui lòng chỉ định ví thanh toán để tất toán', 400, ERROR_CODE.DEFAULT_WALLET_REQUIRED);
        }

        const wallet = await tx.wallet.findFirst({
          where: { id: targetWalletId, userId },
        });

        if (!wallet || wallet.isArchived) {
          throw new AppError('Ví thanh toán không tồn tại hoặc đã bị lưu trữ', 400, ERROR_CODE.WALLET_ARCHIVED);
        }

        // Điều chỉnh số dư ví
        if (contract.type === 'DEBT_PAYABLE') {
          if (wallet.balance.lessThan(totalAmountToPay)) {
            throw new AppError('Số dư ví không đủ để tất toán toàn bộ khoản nợ', 400, ERROR_CODE.INSUFFICIENT_BALANCE);
          }

          await tx.wallet.update({
            where: { id: wallet.id },
            data: { balance: { decrement: totalAmountToPay } },
          });
        } else {
          await tx.wallet.update({
            where: { id: wallet.id },
            data: { balance: { increment: totalAmountToPay } },
          });
        }

        // Nếu có phí phạt, ghi nhận vào P&L Expense
        const paidDateBusiness = dto.paidDate || instantToBusinessDate(new Date());
        const paidPrismaDate = businessDateToPrismaDate(paidDateBusiness);

        if (penaltyFee.greaterThan(0)) {
          const category = await this.getOrCreateInterestCategory(userId, TransactionType.EXPENSE, tx);
          await tx.transaction.create({
            data: {
              userId,
              walletId: wallet.id,
              categoryId: category.id,
              amount: penaltyFee,
              type: TransactionType.EXPENSE,
              date: paidPrismaDate,
              description: `Phí phạt tất toán trước hạn: ${contract.name} (${contract.counterparty})`,
            },
          });
        }

        // Đánh dấu toàn bộ các kỳ tương lai chưa trả là WAIVED (miễn lãi và nghĩa vụ)
        await tx.debtScheduleItem.updateMany({
          where: {
            debtContractId: contract.id,
            status: { notIn: ['PAID', 'WAIVED'] },
          },
          data: {
            status: 'WAIVED',
            notes: 'Miễn trừ do tất toán trước hạn',
          },
        });

        // Đóng hợp đồng nợ
        const updatedContract = await tx.debtContract.update({
          where: { id: contract.id },
          data: {
            remainingPrincipal: new Prisma.Decimal(0),
            status: 'COMPLETED',
          },
        });

        return {
          contract: updatedContract,
          settlementDetails: {
            principalSettled: remainingPrincipal.toNumber(),
            penaltyFee: penaltyFee.toNumber(),
            totalAmountPaid: totalAmountToPay.toNumber(),
            walletId: wallet.id,
            status: 'COMPLETED',
          },
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }
}
