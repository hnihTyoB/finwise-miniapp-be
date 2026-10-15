import {
  NotificationPriority,
  NotificationSourceType,
  NotificationType,
  Prisma,
  TermDepositRolloverMethod,
} from '@prisma/client';
import {
  addBusinessDays,
  addBusinessMonthsClamped,
  businessDateToPrismaDate,
  instantToBusinessDate,
  prismaDateToBusinessDate,
} from '../../../common/date-time/business-time';
import { LoggerService } from '../../../common/services/logger.service';
import { NotificationService } from '../../notifications/notification.service';
import { SavingsRepository } from '../savings.repository';
import { SavingsCalculatorEngine } from './savings-calculator.engine';

export class SavingsReminderService {
  private readonly notificationService = new NotificationService();
  private readonly repository = new SavingsRepository();
  private readonly logger = new LoggerService('SavingsReminderService');

  /**
   * Quét và gửi cảnh báo trước ngày đáo hạn 3 ngày (T-3)
   */
  public async processDueReminders(now = new Date()): Promise<{ t3Count: number }> {
    const todayBusiness = instantToBusinessDate(now);
    const todayDate = businessDateToPrismaDate(todayBusiness);
    const t3Business = addBusinessDays(todayBusiness, 3);
    const t3Date = businessDateToPrismaDate(t3Business);

    let t3Count = 0;

    const dueItems = await this.repository.findDueReminderDeposits(t3Date, todayDate);

    for (const item of dueItems) {
      try {
        const maturityDateStr = prismaDateToBusinessDate(item.maturityDate);
        const dedupKey = `SAVINGS_T3_${item.id}_${maturityDateStr}`;
        const principalStr = Number(item.principalAmount).toLocaleString('vi-VN');
        const interestStr = Number(item.estimatedInterest).toLocaleString('vi-VN');

        let rolloverText = 'Tự động tái tục gốc + lãi';
        if (item.rolloverMethod === TermDepositRolloverMethod.ROLLOVER_PRINCIPAL) {
          rolloverText = 'Tái tục gốc, nhận lãi về ví';
        } else if (item.rolloverMethod === TermDepositRolloverMethod.SETTLE_TO_WALLET) {
          rolloverText = 'Tất toán toàn bộ về ví chính';
        }

        const title = `🔔 Sổ tiết kiệm sắp đáo hạn (Còn 3 ngày)`;
        const message =
          `Sổ tiết kiệm "${item.wallet.name}" tại ${item.bankName} (${principalStr} đ) sẽ đáo hạn vào ngày ${maturityDateStr}.\n` +
          `• Lãi dự kiến nhận: +${interestStr} đ\n` +
          `• Phương thức hiện tại: ${rolloverText}\n` +
          `👉 Nhấn vào để kiểm tra hoặc cập nhật kế hoạch tái tục / rút vốn!`;

        await this.notificationService.create({
          userId: item.userId,
          type: NotificationType.SAVINGS_DEPOSIT_DUE_SOON,
          priority: NotificationPriority.HIGH,
          title,
          message,
          sourceType: NotificationSourceType.SAVINGS_DEPOSIT,
          sourceId: item.id,
          actionUrl: `/wallets?tab=savings&id=${item.id}`,
          dedupKey,
          data: {
            termDepositId: item.id,
            walletId: item.walletId,
            bankName: item.bankName,
            principalAmount: item.principalAmount.toString(),
            estimatedInterest: item.estimatedInterest.toString(),
            maturityDate: maturityDateStr,
            rolloverMethod: item.rolloverMethod,
          },
        });

        await this.repository.markReminderSent(item.id, 'T3');
        t3Count += 1;
      } catch (err) {
        this.logger.error(`Failed to process T-3 savings reminder for item ${item.id}`, err);
      }
    }

    return { t3Count };
  }

  /**
   * Quét và thực thi tự động Đáo hạn / Tái tục / Tất toán khi đến ngày T-0
   */
  public async processDueRollovers(now = new Date()): Promise<{ rolloverCount: number }> {
    const todayBusiness = instantToBusinessDate(now);
    const todayDate = businessDateToPrismaDate(todayBusiness);

    let rolloverCount = 0;

    const maturedItems = await this.repository.findDueMaturityDeposits(todayDate);

    for (const item of maturedItems) {
      try {
        const maturityDateStr = prismaDateToBusinessDate(item.maturityDate);
        const dedupKey = `SAVINGS_T0_${item.id}_${maturityDateStr}`;

        if (item.rolloverMethod === TermDepositRolloverMethod.ROLLOVER_ALL) {
          // 1. Tự động tái tục Gốc + Lãi
          const newPrincipal = item.principalAmount.add(item.estimatedInterest);
          const newStartDate = item.maturityDate;
          const newStartDateStr = prismaDateToBusinessDate(newStartDate);
          const newMaturityDateStr = addBusinessMonthsClamped(newStartDateStr, item.termMonths);
          const newMaturityDate = businessDateToPrismaDate(newMaturityDateStr);
          const actualDays = SavingsCalculatorEngine.calculateActualDays(newStartDateStr, newMaturityDateStr);
          const newEstInterest = SavingsCalculatorEngine.calculateTermInterest(
            newPrincipal.toString(),
            item.interestRate.toString(),
            actualDays,
          );

          await this.repository.executeRolloverAtomic(
            item.id,
            TermDepositRolloverMethod.ROLLOVER_ALL,
            newStartDate,
            newMaturityDate,
            newPrincipal,
            item.estimatedInterest,
            new Prisma.Decimal(newEstInterest.toString()),
          );

          const interestStr = Number(item.estimatedInterest).toLocaleString('vi-VN');
          const newPrincipalStr = Number(newPrincipal).toLocaleString('vi-VN');

          await this.notificationService.create({
            userId: item.userId,
            type: NotificationType.SAVINGS_DEPOSIT_MATURED,
            priority: NotificationPriority.NORMAL,
            title: `💰 Sổ tiết kiệm đã tự động tái tục gốc + lãi`,
            message:
              `Sổ tiết kiệm "${item.wallet.name}" đã hoàn thành kỳ hạn. Tiền lãi ${interestStr} đ đã được nhập vào gốc.\n` +
              `• Gốc chu kỳ mới: ${newPrincipalStr} đ\n` +
              `• Ngày đáo hạn tiếp theo: ${newMaturityDateStr}`,
            sourceType: NotificationSourceType.SAVINGS_DEPOSIT,
            sourceId: item.id,
            actionUrl: `/wallets?tab=savings&id=${item.id}`,
            dedupKey,
          });

          rolloverCount += 1;
        } else if (item.rolloverMethod === TermDepositRolloverMethod.ROLLOVER_PRINCIPAL) {
          // 2. Tái tục Gốc, nhận lãi về ví
          const newStartDate = item.maturityDate;
          const newStartDateStr = prismaDateToBusinessDate(newStartDate);
          const newMaturityDateStr = addBusinessMonthsClamped(newStartDateStr, item.termMonths);
          const newMaturityDate = businessDateToPrismaDate(newMaturityDateStr);
          const actualDays = SavingsCalculatorEngine.calculateActualDays(newStartDateStr, newMaturityDateStr);
          const newEstInterest = SavingsCalculatorEngine.calculateTermInterest(
            item.principalAmount.toString(),
            item.interestRate.toString(),
            actualDays,
          );

          await this.repository.executeRolloverAtomic(
            item.id,
            TermDepositRolloverMethod.ROLLOVER_PRINCIPAL,
            newStartDate,
            newMaturityDate,
            item.principalAmount,
            item.estimatedInterest,
            new Prisma.Decimal(newEstInterest.toString()),
          );

          const interestStr = Number(item.estimatedInterest).toLocaleString('vi-VN');

          await this.notificationService.create({
            userId: item.userId,
            type: NotificationType.SAVINGS_DEPOSIT_MATURED,
            priority: NotificationPriority.NORMAL,
            title: `💰 Đã nhận lãi và tái tục gốc sổ tiết kiệm`,
            message:
              `Sổ tiết kiệm "${item.wallet.name}" đã tái tục gốc thành công.\n` +
              `• Tiền lãi nhận về: +${interestStr} đ\n` +
              `• Ngày đáo hạn tiếp theo: ${newMaturityDateStr}`,
            sourceType: NotificationSourceType.SAVINGS_DEPOSIT,
            sourceId: item.id,
            actionUrl: `/wallets?tab=savings&id=${item.id}`,
            dedupKey,
          });

          rolloverCount += 1;
        } else if (item.rolloverMethod === TermDepositRolloverMethod.SETTLE_TO_WALLET) {
          // 3. Tự động tất toán về ví chính
          if (item.targetWalletId) {
            await this.repository.executeSettlementAtomic(
              item.userId,
              item.id,
              item.targetWalletId,
              item.principalAmount,
              item.estimatedInterest,
              false,
              'Tự động tất toán đúng hạn',
            );

            const totalReceivedStr = Number(item.principalAmount.add(item.estimatedInterest)).toLocaleString('vi-VN');

            await this.notificationService.create({
              userId: item.userId,
              type: NotificationType.SAVINGS_DEPOSIT_MATURED,
              priority: NotificationPriority.NORMAL,
              title: `🎉 Tất toán sổ tiết kiệm thành công`,
              message:
                `Sổ tiết kiệm "${item.wallet.name}" đã được tất toán thành công.\n` +
                `• Tổng tiền nhận về (Gốc + Lãi): +${totalReceivedStr} đ đã chuyển về ví của bạn.`,
              sourceType: NotificationSourceType.SAVINGS_DEPOSIT,
              sourceId: item.id,
              actionUrl: `/wallets`,
              dedupKey,
            });

            rolloverCount += 1;
          } else {
            // Không có ví nhận -> đánh dấu và gửi thông báo nhắc user chọn ví
            await this.notificationService.create({
              userId: item.userId,
              type: NotificationType.SAVINGS_DEPOSIT_MATURED,
              priority: NotificationPriority.HIGH,
              title: `🔔 Sổ tiết kiệm "${item.wallet.name}" đã đến hạn tất toán`,
              message: `Sổ tiết kiệm đã đến ngày đáo hạn. Vui lòng vào ứng dụng chọn ví để nhận tiền gốc và lãi!`,
              sourceType: NotificationSourceType.SAVINGS_DEPOSIT,
              sourceId: item.id,
              actionUrl: `/wallets?tab=savings&id=${item.id}`,
              dedupKey,
            });
            await this.repository.markReminderSent(item.id, 'T0');
          }
        }
      } catch (err) {
        this.logger.error(`Failed to process T-0 maturity rollover for item ${item.id}`, err);
      }
    }

    return { rolloverCount };
  }
}

export const savingsReminderService = new SavingsReminderService();
