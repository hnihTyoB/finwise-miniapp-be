import crypto from 'crypto';
import { prisma } from '../../../database/prisma.client';
import { cacheService } from '../../../common/services/cache.service';
import { envConfig } from '../../../config/env.config';
import { LoggerService } from '../../../common/services/logger.service';
import { NotificationChannel } from '@prisma/client';

export class ZaloBotLinkService {
  private readonly logger = new LoggerService('ZaloBotLinkService');

  /**
   * Sinh mã liên kết ngẫu nhiên dạng FW-XXXX cho tài khoản người dùng FinWise.
   * Mã có hiệu lực trong khoảng thời gian TTL (mặc định 10 phút).
   */
  async generateLinkCode(userId: string): Promise<{
    linkCode: string;
    expiresInSeconds: number;
    deepLinkInstruction: string;
  }> {
    // Tạo mã ngẫu nhiên 4 ký tự chữ số/in hoa
    const randomPart = crypto.randomBytes(3).toString('hex').slice(0, 4).toUpperCase();
    const linkCode = `FW-${randomPart}`;
    const ttlSeconds = envConfig.zaloBot.linkCodeTtlSeconds;

    // Lưu vào cache
    await cacheService.set(`zalo:link:code:${linkCode}`, userId, ttlSeconds);
    // Lưu alias không có gạch nối để user gõ liền cũng nhận diện được (VD: FW9482)
    const rawCode = linkCode.replace('-', '');
    await cacheService.set(`zalo:link:code:${rawCode}`, userId, ttlSeconds);

    this.logger.info(`Generated Zalo link code "${linkCode}" for user ${userId} (TTL: ${ttlSeconds}s)`);

    return {
      linkCode,
      expiresInSeconds: ttlSeconds,
      deepLinkInstruction: `Nhắn "${linkCode}" cho Bot Finwise để hoàn tất liên kết.`,
    };
  }

  /**
   * Xác thực mã liên kết và gán chat_id vào tài khoản FinWise tương ứng.
   */
  async verifyAndConsumeLinkCode(
    inputCode: string,
    chatId: string,
    displayName: string = 'Người dùng',
  ): Promise<{
    success: boolean;
    reason?: string;
    userName?: string;
  }> {
    const cleanCode = inputCode.trim().toUpperCase();
    const userId = await cacheService.get<string>(`zalo:link:code:${cleanCode}`);

    if (!userId) {
      // Thử tìm theo dạng không có dấu gạch nối
      const rawCode = cleanCode.replace(/[^A-Z0-9]/g, '');
      const fallbackUserId = await cacheService.get<string>(`zalo:link:code:${rawCode}`);
      if (!fallbackUserId) {
        return { success: false, reason: 'INVALID_OR_EXPIRED_CODE' };
      }
      return this.executeLink(fallbackUserId, rawCode, chatId, displayName);
    }

    return this.executeLink(userId, cleanCode, chatId, displayName);
  }

  private async executeLink(
    userId: string,
    code: string,
    chatId: string,
    displayName: string,
  ): Promise<{ success: boolean; reason?: string; userName?: string }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { fullName: true, email: true },
    });

    if (!user) {
      return { success: false, reason: 'USER_NOT_FOUND' };
    }

    // Lấy setting hiện tại để gộp channel
    const currentSetting = await prisma.notificationSetting.findUnique({
      where: { userId },
    });

    const currentChannels = currentSetting?.channels || [NotificationChannel.IN_APP];
    const newChannels = Array.from(new Set([...currentChannels, NotificationChannel.ZALO]));

    // Cập nhật setting
    await prisma.notificationSetting.upsert({
      where: { userId },
      create: {
        userId,
        zaloBotChatId: chatId,
        channels: newChannels,
      },
      update: {
        zaloBotChatId: chatId,
        channels: newChannels,
      },
    });

    // Xóa mã liên kết đã dùng khỏi cache
    await cacheService.del(`zalo:link:code:${code}`);
    await cacheService.del(`zalo:link:code:${code.replace('-', '')}`);

    this.logger.info(`Successfully linked Zalo chat_id "${chatId}" (${displayName}) to FinWise user ${userId}`);

    return {
      success: true,
      userName: user.fullName || user.email || 'bạn',
    };
  }

  /**
   * Lấy trạng thái liên kết Zalo Bot của người dùng.
   */
  async getLinkStatus(userId: string): Promise<{
    linked: boolean;
    zaloBotChatId: string | null;
    channels: string[];
  }> {
    const setting = await prisma.notificationSetting.findUnique({
      where: { userId },
      select: { zaloBotChatId: true, channels: true },
    });

    const isLinked = Boolean(
      setting?.zaloBotChatId && setting.channels.includes(NotificationChannel.ZALO),
    );

    return {
      linked: isLinked,
      zaloBotChatId: setting?.zaloBotChatId || null,
      channels: setting?.channels || [NotificationChannel.IN_APP],
    };
  }

  /**
   * Hủy liên kết Zalo Bot cho người dùng.
   */
  async unlinkBot(userId: string): Promise<{ success: boolean }> {
    const setting = await prisma.notificationSetting.findUnique({
      where: { userId },
    });

    if (setting) {
      const filteredChannels = setting.channels.filter(
        (c: NotificationChannel) => c !== NotificationChannel.ZALO,
      );
      // Đảm bảo tối thiểu còn 1 channel
      const updatedChannels = filteredChannels.length > 0 ? filteredChannels : [NotificationChannel.IN_APP];

      await prisma.notificationSetting.update({
        where: { userId },
        data: {
          zaloBotChatId: null,
          channels: updatedChannels,
        },
      });
    }

    this.logger.info(`Unlinked Zalo Bot for user ${userId}`);
    return { success: true };
  }
}

export const zaloBotLinkService = new ZaloBotLinkService();
