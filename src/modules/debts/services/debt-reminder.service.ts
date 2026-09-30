import {
  NotificationPriority,
  NotificationSourceType,
  NotificationType,
} from '@prisma/client';
import {
  addBusinessDays,
  businessDateToPrismaDate,
  instantToBusinessDate,
  prismaDateToBusinessDate,
} from '../../../common/date-time/business-time';
import { NotificationService } from '../../notifications/notification.service';
import { LoggerService } from '../../../common/services/logger.service';
import { DebtRepository } from '../debt.repository';

export class DebtReminderService {
  private readonly notificationService = new NotificationService();
  private readonly debtRepository = new DebtRepository();
  private readonly logger = new LoggerService('DebtReminderService');

  /**
   * Quét và xử lý các kỳ nợ sắp đến hạn (T-3, T-0) và quá hạn (Overdue)
   */
  public async processDueReminders(now = new Date()): Promise<{
    t3Count: number;
    t0Count: number;
    overdueCount: number;
  }> {
    const todayBusiness = instantToBusinessDate(now);
    const t3Business = addBusinessDays(todayBusiness, 3);

    const todayDate = businessDateToPrismaDate(todayBusiness);
    const t3Date = businessDateToPrismaDate(t3Business);

    let t3Count = 0;
    let t0Count = 0;
    let overdueCount = 0;

    // 1. Quét nhóm T-3: Ngày đến hạn đúng bằng hôm nay + 3 ngày (Chỉ lấy SCHEDULED để không bị lặp mỗi 30s)
    const t3Items = await this.debtRepository.findScheduledReminderItems(t3Date);

    for (const item of t3Items) {
      try {
        const dueDateStr = prismaDateToBusinessDate(item.dueDate);
        const dedupKey = `DEBT_T3_${item.id}_${dueDateStr}`;
        const totalAmountStr = Number(item.totalDue).toLocaleString('vi-VN');
        const principalStr = Number(item.principalDue).toLocaleString('vi-VN');
        const interestStr = Number(item.interestDue).toLocaleString('vi-VN');
        const isPayable = item.debtContract.type === 'DEBT_PAYABLE';

        const title = isPayable
          ? `🔔 Nhắc hạn trả nợ (Còn 3 ngày)`
          : `🔔 Nhắc hạn thu nợ (Còn 3 ngày)`;

        const message = isPayable
          ? `Kỳ ${item.period} khoản nợ "${item.debtContract.name}" (${item.debtContract.counterparty}) sắp đến hạn ngày ${dueDateStr}.\n` +
            `• Tổng tiền: ${totalAmountStr} đ (Gốc: ${principalStr} đ, Lãi: ${interestStr} đ)\n` +
            `👉 Gõ lệnh: /tra_no ${item.id} để thanh toán nhanh qua Zalo!`
          : `Kỳ ${item.period} khoản cho vay "${item.debtContract.name}" (${item.debtContract.counterparty}) sắp đến hạn thu hồi ngày ${dueDateStr}.\n` +
            `• Số tiền dự kiến thu: ${totalAmountStr} đ (Gốc: ${principalStr} đ, Lãi: ${interestStr} đ)\n` +
            `👉 Gõ lệnh: /tra_no ${item.id} để xác nhận khi đã nhận tiền!`;

        await this.notificationService.create({
          userId: item.userId,
          type: NotificationType.DEBT_PAYMENT_DUE,
          priority: NotificationPriority.NORMAL,
          title,
          message,
          sourceType: NotificationSourceType.DEBT,
          sourceId: item.debtContractId,
          actionUrl: `/debts/${item.debtContractId}`,
          dedupKey,
          data: {
            debtContractId: item.debtContractId,
            scheduleItemId: item.id,
            period: item.period,
            totalDue: item.totalDue.toString(),
            dueDate: dueDateStr,
            debtType: item.debtContract.type,
          },
        });

        // Đánh dấu kỳ chuyển sang UPCOMING để lần quét tiếp theo không lặp lại
        await this.debtRepository.updateScheduleItemStatus(item.id, 'UPCOMING');

        t3Count += 1;
      } catch (err) {
        this.logger.error(`Failed to process T-3 debt reminder for item ${item.id}`, err);
      }
    }

    // 2. Quét nhóm T-0: Đến hạn hôm nay (Chỉ lấy SCHEDULED hoặc UPCOMING để không bị lặp khi đã là DUE)
    const t0Items = await this.debtRepository.findDueReminderItems(todayDate);

    for (const item of t0Items) {
      try {
        const dueDateStr = prismaDateToBusinessDate(item.dueDate);
        const dedupKey = `DEBT_T0_${item.id}_${dueDateStr}`;
        const totalAmountStr = Number(item.totalDue).toLocaleString('vi-VN');
        const isPayable = item.debtContract.type === 'DEBT_PAYABLE';

        const title = isPayable
          ? `⚠️ Đến hạn trả nợ hôm nay`
          : `⚠️ Đến hạn thu hồi khoản cho vay hôm nay`;

        const message = isPayable
          ? `Hôm nay là hạn thanh toán kỳ ${item.period} khoản nợ "${item.debtContract.name}" (${item.debtContract.counterparty}).\n` +
            `• Số tiền cần thanh toán: ${totalAmountStr} đ\n` +
            `👉 Gõ lệnh: /tra_no ${item.id} để thanh toán ngay!`
          : `Hôm nay là hạn thu nợ kỳ ${item.period} khoản cho vay "${item.debtContract.name}" (${item.debtContract.counterparty}).\n` +
            `• Số tiền cần thu hồi: ${totalAmountStr} đ\n` +
            `👉 Gõ lệnh: /tra_no ${item.id} để xác nhận khi đã nhận tiền!`;

        await this.notificationService.create({
          userId: item.userId,
          type: NotificationType.DEBT_PAYMENT_DUE,
          priority: NotificationPriority.HIGH,
          title,
          message,
          sourceType: NotificationSourceType.DEBT,
          sourceId: item.debtContractId,
          actionUrl: `/debts/${item.debtContractId}`,
          dedupKey,
          data: {
            debtContractId: item.debtContractId,
            scheduleItemId: item.id,
            period: item.period,
            totalDue: item.totalDue.toString(),
            dueDate: dueDateStr,
            debtType: item.debtContract.type,
          },
        });

        // Đánh dấu kỳ chuyển sang DUE
        await this.debtRepository.updateScheduleItemStatus(item.id, 'DUE');

        t0Count += 1;
      } catch (err) {
        this.logger.error(`Failed to process T-0 debt reminder for item ${item.id}`, err);
      }
    }

    // 3. Quét nhóm Quá hạn (dueDate < todayDate)
    const overdueItems = await this.debtRepository.findOverdueReminderItems(todayDate);

    for (const item of overdueItems) {
      try {
        const dueDateStr = prismaDateToBusinessDate(item.dueDate);
        const dedupKey = `DEBT_OVERDUE_${item.id}_${todayBusiness}`;
        const totalAmountStr = Number(item.totalDue).toLocaleString('vi-VN');
        const isPayable = item.debtContract.type === 'DEBT_PAYABLE';

        // Cập nhật trạng thái kỳ nợ sang OVERDUE
        await this.debtRepository.updateScheduleItemStatus(item.id, 'OVERDUE');

        // Cập nhật hợp đồng sang OVERDUE
        if (item.debtContract.status !== 'OVERDUE') {
          await this.debtRepository.updateContractStatus(item.debtContractId, 'OVERDUE');
        }

        const title = isPayable
          ? `🚨 Khoản nợ đã quá hạn thanh toán`
          : `🚨 Khoản cho vay đã quá hạn thu hồi`;

        const message = isPayable
          ? `Kỳ ${item.period} khoản nợ "${item.debtContract.name}" (${item.debtContract.counterparty}) đã quá hạn ngày ${dueDateStr}!\n` +
            `• Số tiền cần thanh toán: ${totalAmountStr} đ\n` +
            `👉 Gõ lệnh: /tra_no ${item.id} để thanh toán ngay!`
          : `Kỳ ${item.period} khoản cho vay "${item.debtContract.name}" (${item.debtContract.counterparty}) đã quá hạn ngày ${dueDateStr}!\n` +
            `• Số tiền chưa thu hồi: ${totalAmountStr} đ\n` +
            `👉 Hãy liên hệ ${item.debtContract.counterparty} và gõ: /tra_no ${item.id} khi nhận tiền!`;

        await this.notificationService.create({
          userId: item.userId,
          type: NotificationType.DEBT_PAYMENT_DUE,
          priority: NotificationPriority.CRITICAL,
          title,
          message,
          sourceType: NotificationSourceType.DEBT,
          sourceId: item.debtContractId,
          actionUrl: `/debts/${item.debtContractId}`,
          dedupKey,
          data: {
            debtContractId: item.debtContractId,
            scheduleItemId: item.id,
            period: item.period,
            totalDue: item.totalDue.toString(),
            dueDate: dueDateStr,
            debtType: item.debtContract.type,
          },
        });

        overdueCount += 1;
      } catch (err) {
        this.logger.error(`Failed to process overdue debt for item ${item.id}`, err);
      }
    }

    return { t3Count, t0Count, overdueCount };
  }
}

export const debtReminderService = new DebtReminderService();
