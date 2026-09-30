import {
  NotificationPriority,
  NotificationSourceType,
  NotificationType,
} from '@prisma/client';
import { prisma } from '../../../database/prisma.client';
import {
  addBusinessDays,
  businessDateToPrismaDate,
  instantToBusinessDate,
  prismaDateToBusinessDate,
} from '../../../common/date-time/business-time';
import { NotificationService } from '../../notifications/notification.service';
import { zaloBotService } from '../../../common/services/zalo-bot.service';
import { LoggerService } from '../../../common/services/logger.service';

export class DebtReminderService {
  private readonly notificationService = new NotificationService();
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

    // 1. Quét nhóm T-3: Ngày đến hạn đúng bằng hôm nay + 3 ngày
    const t3Items = await prisma.debtScheduleItem.findMany({
      where: {
        dueDate: t3Date,
        status: { in: ['SCHEDULED', 'UPCOMING'] },
        debtContract: {
          status: 'ACTIVE',
          isArchived: false,
        },
      },
      include: {
        debtContract: true,
        user: {
          include: {
            notificationSetting: true,
          },
        },
      },
    });

    for (const item of t3Items) {
      try {
        const dueDateStr = prismaDateToBusinessDate(item.dueDate);
        const dedupKey = `DEBT_T3_${item.id}_${dueDateStr}`;
        const totalAmountStr = Number(item.totalDue).toLocaleString('vi-VN');
        const principalStr = Number(item.principalDue).toLocaleString('vi-VN');
        const interestStr = Number(item.interestDue).toLocaleString('vi-VN');

        const title = `🔔 Nhắc hạn khoản nợ (Còn 3 ngày)`;
        const message =
          `Kỳ ${item.period} khoản "${item.debtContract.name}" (${item.debtContract.counterparty}) sắp đến hạn ngày ${dueDateStr}.\n` +
          `• Tổng tiền: ${totalAmountStr} đ (Gốc: ${principalStr} đ, Lãi: ${interestStr} đ)\n` +
          `👉 Gõ lệnh: /tra_no ${item.id} để thanh toán nhanh qua Zalo!`;

        await this.notificationService.create({
          userId: item.userId,
          type: NotificationType.DEBT_PAYMENT_DUE,
          priority: NotificationPriority.NORMAL,
          title,
          message,
          sourceType: NotificationSourceType.DEBT,
          sourceId: item.debtContractId,
          dedupKey,
          data: {
            debtContractId: item.debtContractId,
            scheduleItemId: item.id,
            period: item.period,
            totalDue: item.totalDue.toString(),
            dueDate: dueDateStr,
          },
        });

        // Đánh dấu kỳ chuyển sang UPCOMING
        await prisma.debtScheduleItem.update({
          where: { id: item.id },
          data: { status: 'UPCOMING' },
        });

        // Bắn trực tiếp qua Zalo Bot nếu user đã kết nối
        const chatId = item.user.notificationSetting?.zaloBotChatId;
        if (chatId && zaloBotService.isConfigured()) {
          await zaloBotService.sendMessage(
            chatId,
            `🔔 **NHẮC HẠN KHOẢN NỢ (CÒN 3 NGÀY)**\n\n` +
            `📌 **Khoản:** ${item.debtContract.name} (${item.debtContract.counterparty})\n` +
            `🔹 **Kỳ:** ${item.period}\n` +
            `📅 **Hạn thanh toán:** ${dueDateStr}\n` +
            `💰 **Số tiền phải trả:** ${totalAmountStr} đ\n` +
            `   • Gốc: ${principalStr} đ | Lãi: ${interestStr} đ\n\n` +
            `⚡ **Thanh toán 1-chạm:**\n` +
            `Gõ: \`/tra_no ${item.id}\``,
          );
        }

        t3Count += 1;
      } catch (err) {
        this.logger.error(`Failed to process T-3 debt reminder for item ${item.id}`, err);
      }
    }

    // 2. Quét nhóm T-0: Đến hạn hôm nay
    const t0Items = await prisma.debtScheduleItem.findMany({
      where: {
        dueDate: todayDate,
        status: { in: ['SCHEDULED', 'UPCOMING', 'DUE'] },
        debtContract: {
          status: 'ACTIVE',
          isArchived: false,
        },
      },
      include: {
        debtContract: true,
        user: {
          include: {
            notificationSetting: true,
          },
        },
      },
    });

    for (const item of t0Items) {
      try {
        const dueDateStr = prismaDateToBusinessDate(item.dueDate);
        const dedupKey = `DEBT_T0_${item.id}_${dueDateStr}`;
        const totalAmountStr = Number(item.totalDue).toLocaleString('vi-VN');

        const title = `⚠️ Đến hạn thanh toán khoản nợ hôm nay`;
        const message =
          `Hôm nay là hạn thanh toán kỳ ${item.period} khoản "${item.debtContract.name}".\n` +
          `• Số tiền cần thanh toán: ${totalAmountStr} đ\n` +
          `👉 Gõ lệnh: /tra_no ${item.id} để thanh toán ngay!`;

        await this.notificationService.create({
          userId: item.userId,
          type: NotificationType.DEBT_PAYMENT_DUE,
          priority: NotificationPriority.HIGH,
          title,
          message,
          sourceType: NotificationSourceType.DEBT,
          sourceId: item.debtContractId,
          dedupKey,
          data: {
            debtContractId: item.debtContractId,
            scheduleItemId: item.id,
            period: item.period,
            totalDue: item.totalDue.toString(),
            dueDate: dueDateStr,
          },
        });

        await prisma.debtScheduleItem.update({
          where: { id: item.id },
          data: { status: 'DUE' },
        });

        const chatId = item.user.notificationSetting?.zaloBotChatId;
        if (chatId && zaloBotService.isConfigured()) {
          await zaloBotService.sendMessage(
            chatId,
            `⚠️ **ĐẾN HẠN THANH TOÁN HÔM NAY!**\n\n` +
            `📌 **Khoản:** ${item.debtContract.name} (${item.debtContract.counterparty})\n` +
            `🔹 **Kỳ:** ${item.period}\n` +
            `💰 **Tổng số tiền:** ${totalAmountStr} đ\n\n` +
            `👉 Gõ: \`/tra_no ${item.id}\` để xác nhận thanh toán ngay!`,
          );
        }

        t0Count += 1;
      } catch (err) {
        this.logger.error(`Failed to process T-0 debt reminder for item ${item.id}`, err);
      }
    }

    // 3. Quét nhóm Quá hạn (dueDate < todayDate)
    const overdueItems = await prisma.debtScheduleItem.findMany({
      where: {
        dueDate: { lt: todayDate },
        status: { in: ['SCHEDULED', 'UPCOMING', 'DUE'] },
        debtContract: {
          status: { in: ['ACTIVE', 'OVERDUE'] },
          isArchived: false,
        },
      },
      include: {
        debtContract: true,
        user: {
          include: {
            notificationSetting: true,
          },
        },
      },
    });

    for (const item of overdueItems) {
      try {
        const dueDateStr = prismaDateToBusinessDate(item.dueDate);
        const dedupKey = `DEBT_OVERDUE_${item.id}_${todayBusiness}`;
        const totalAmountStr = Number(item.totalDue).toLocaleString('vi-VN');

        // Cập nhật trạng thái kỳ nợ sang OVERDUE
        await prisma.debtScheduleItem.update({
          where: { id: item.id },
          data: { status: 'OVERDUE' },
        });

        // Cập nhật hợp đồng sang OVERDUE
        if (item.debtContract.status !== 'OVERDUE') {
          await prisma.debtContract.update({
            where: { id: item.debtContractId },
            data: { status: 'OVERDUE' },
          });
        }

        await this.notificationService.create({
          userId: item.userId,
          type: NotificationType.DEBT_PAYMENT_DUE,
          priority: NotificationPriority.CRITICAL,
          title: `🚨 Khoản nợ đã quá hạn thanh toán`,
          message: `Kỳ ${item.period} khoản "${item.debtContract.name}" (Hạn: ${dueDateStr}) đã quá hạn! Số tiền: ${totalAmountStr} đ`,
          sourceType: NotificationSourceType.DEBT,
          sourceId: item.debtContractId,
          dedupKey,
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
