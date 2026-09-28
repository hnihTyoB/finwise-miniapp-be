import { NotificationChannel, Prisma, TransactionType } from '@prisma/client';
import { prisma } from '../../database/prisma.client';
import { businessDateToPrismaDate } from '../../common/date-time/business-time';

export class ZaloBotRepository {
  /**
   * Tra cứu userId từ chatId Zalo (kiểm tra liên kết).
   */
  async findLinkedUserByChatId(chatId: string): Promise<{ userId: string } | null> {
    return prisma.notificationSetting.findFirst({
      where: { zaloBotChatId: chatId },
      select: { userId: true },
    });
  }

  /**
   * Lấy user và ví còn hoạt động theo chatId Zalo (ưu tiên bản ghi mới nhất, giới hạn 1 tài khoản).
   */
  async findUsersWithWalletsByChatId(chatId: string) {
    return prisma.notificationSetting.findMany({
      where: { zaloBotChatId: chatId },
      orderBy: { updatedAt: 'desc' },
      take: 1,
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            wallets: {
              where: { isArchived: false },
              select: { name: true, balance: true, currency: true },
            },
          },
        },
      },
    });
  }

  /**
   * Tải danh mục và ví của người dùng phục vụ phân tích ngôn ngữ tự nhiên.
   */
  async loadUserEntities(userId: string) {
    const [categories, wallets] = await Promise.all([
      prisma.category.findMany({
        where: {
          OR: [{ userId }, { userId: null, isSystem: true }],
          isArchived: false,
        },
        select: { id: true, name: true, type: true },
      }),
      prisma.wallet.findMany({
        where: { userId, isArchived: false },
        select: { id: true, name: true, currency: true, isDefault: true },
      }),
    ]);

    return { categories, wallets };
  }

  /**
   * Lấy thông tin ví và số dư theo userId.
   */
  async getWallet(walletId: string, userId: string) {
    return prisma.wallet.findFirst({
      where: { id: walletId, userId },
      select: { id: true, name: true, balance: true, currency: true },
    });
  }

  /**
   * Lấy thông tin giao dịch để phục vụ hoàn tác hoặc sửa đổi vi sai.
   */
  async getTransactionWithDetails(transactionId: string, userId: string) {
    return prisma.transaction.findFirst({
      where: { id: transactionId, userId },
      include: {
        wallet: { select: { id: true, name: true, currency: true, balance: true } },
        category: { select: { id: true, name: true } },
      },
    });
  }

  /**
   * Truy vấn ngân sách danh mục chi tiêu và tính toán tỷ lệ sử dụng hiện tại.
   */
  async findCategoryBudget(userId: string, categoryId: string, businessDate: string) {
    const dateObj = businessDateToPrismaDate(businessDate);

    const budget = await prisma.budget.findFirst({
      where: {
        userId,
        categoryId,
        isArchived: false,
        startDate: { lte: dateObj },
        endDate: { gte: dateObj },
      },
      select: {
        id: true,
        name: true,
        amount: true,
        currency: true,
        alertThreshold: true,
        startDate: true,
        endDate: true,
      },
    });

    if (!budget) return null;

    const agg = await prisma.transaction.aggregate({
      where: {
        userId,
        categoryId,
        type: TransactionType.EXPENSE,
        date: {
          gte: budget.startDate,
          lte: budget.endDate,
        },
        wallet: { currency: budget.currency },
      },
      _sum: { amount: true },
    });

    const spent = Number(agg._sum.amount ?? new Prisma.Decimal(0));
    const limit = Number(budget.amount);
    const remaining = limit - spent;
    const usagePercentage = limit > 0 ? (spent / limit) * 100 : 0;

    let status: 'ON_TRACK' | 'NEAR_LIMIT' | 'EXCEEDED' = 'ON_TRACK';
    if (spent > limit) {
      status = 'EXCEEDED';
    } else if (usagePercentage >= Number(budget.alertThreshold)) {
      status = 'NEAR_LIMIT';
    }

    return {
      name: budget.name,
      usagePercentage,
      remainingAmount: remaining,
      currency: budget.currency,
      status,
    };
  }

  /**
   * Lấy thông tin cơ bản của user để liên kết Zalo.
   */
  async getUserProfile(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: { fullName: true, email: true },
    });
  }

  /**
   * Lấy NotificationSetting của user.
   */
  async getNotificationSetting(userId: string) {
    return prisma.notificationSetting.findUnique({
      where: { userId },
      select: { zaloBotChatId: true, channels: true },
    });
  }

  /**
   * Lưu liên kết chatId Zalo vào NotificationSetting nguyên tử.
   * Đồng thời gỡ chatId khỏi bất kỳ tài khoản cũ nào khác để bảo đảm tính duy nhất 1-to-1 và tránh rò rỉ dữ liệu chéo tài khoản.
   */
  async upsertNotificationSettingLink(
    userId: string,
    chatId: string,
    channels: NotificationChannel[],
  ) {
    return prisma.$transaction(async (tx) => {
      // 1. Thu hồi chatId này nếu đang thuộc về user khác
      const existingHolders = await tx.notificationSetting.findMany({
        where: {
          zaloBotChatId: chatId,
          userId: { not: userId },
        },
        select: { id: true, channels: true },
      });

      for (const holder of existingHolders) {
        const updatedChannels = holder.channels.filter((c) => c !== NotificationChannel.ZALO);
        await tx.notificationSetting.update({
          where: { id: holder.id },
          data: {
            zaloBotChatId: null,
            channels: updatedChannels.length > 0 ? updatedChannels : [NotificationChannel.IN_APP],
          },
        });
      }

      // 2. Gán chatId cho user hiện tại
      return tx.notificationSetting.upsert({
        where: { userId },
        create: {
          userId,
          zaloBotChatId: chatId,
          channels,
        },
        update: {
          zaloBotChatId: chatId,
          channels,
        },
      });
    });
  }

  /**
   * Gỡ liên kết chatId Zalo khỏi NotificationSetting.
   */
  async clearZaloBotChatId(userId: string, channels: NotificationChannel[]) {
    return prisma.notificationSetting.update({
      where: { userId },
      data: {
        zaloBotChatId: null,
        channels,
      },
    });
  }
}

export const zaloBotRepository = new ZaloBotRepository();
