import { prisma } from '../../database/prisma.client';
import { cacheService } from '../../common/services/cache.service';
import { HandoverSessionData, TransferredRecordCounts } from './handover.dto';

export class HandoverRepository {
  private readonly PREFIX_SESSION = 'finwise:handover:session:';
  private readonly PREFIX_PIN = 'finwise:handover:pin:';
  private readonly PREFIX_USER = 'finwise:handover:user:';

  // --- Redis / Cache Operations ---

  async saveSession(session: HandoverSessionData, ttlSeconds: number): Promise<void> {
    const sessionKey = `${this.PREFIX_SESSION}${session.handoverToken}`;
    await cacheService.set(sessionKey, session, ttlSeconds);

    if (session.pinCode) {
      const pinKey = `${this.PREFIX_PIN}${session.pinCode}`;
      await cacheService.set(pinKey, session.handoverToken, ttlSeconds);
    }

    if (session.sourceUserId) {
      const userKey = `${this.PREFIX_USER}${session.sourceUserId}`;
      await cacheService.set(userKey, session.handoverToken, ttlSeconds);
    }
  }

  async getSessionByToken(token: string): Promise<HandoverSessionData | null> {
    const sessionKey = `${this.PREFIX_SESSION}${token}`;
    return cacheService.get<HandoverSessionData>(sessionKey);
  }

  async getTokenByPin(pin: string): Promise<string | null> {
    const pinKey = `${this.PREFIX_PIN}${pin}`;
    return cacheService.get<string>(pinKey);
  }

  async getTokenByUserId(userId: string): Promise<string | null> {
    const userKey = `${this.PREFIX_USER}${userId}`;
    return cacheService.get<string>(userKey);
  }

  async deleteSession(token: string, pin?: string, userId?: string): Promise<void> {
    const sessionKey = `${this.PREFIX_SESSION}${token}`;
    await cacheService.del(sessionKey);

    if (pin) {
      const pinKey = `${this.PREFIX_PIN}${pin}`;
      await cacheService.del(pinKey);
    }

    if (userId) {
      const userKey = `${this.PREFIX_USER}${userId}`;
      await cacheService.del(userKey);
    }
  }

  async decommissionUserCache(userId: string): Promise<void> {
    const userStatusKey = `finwise:user:status:${userId}`;
    await cacheService.set(userStatusKey, false, 30 * 24 * 3600); // 30 days
  }

  async invalidateUserCaches(sourceUserId: string, targetUserId: string): Promise<void> {
    await cacheService.clearPattern(`finwise:cache:*:${sourceUserId}:*`);
    await cacheService.clearPattern(`finwise:cache:*:${targetUserId}:*`);
  }

  // --- Database Operations ---

  async findUserById(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        phoneNumber: true,
        isActive: true,
        deletedAt: true,
        role: { select: { name: true } },
      },
    });
  }

  async createAuditLog(data: {
    actorId: string;
    action: string;
    targetType: string;
    targetId?: string;
    newState?: any;
    ipAddress?: string;
    userAgent?: string;
  }) {
    return prisma.auditLog.create({
      data: {
        actorId: data.actorId,
        action: data.action,
        targetType: data.targetType,
        targetId: data.targetId,
        newState: data.newState,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
      },
    });
  }

  /**
   * Chuyển giao toàn bộ quyền sở hữu dữ liệu từ User A sang User B nguyên tử trong Serializable transaction
   */
  async executeAtomicHandover(
    sourceUserId: string,
    targetUserId: string,
    metadata?: { ipAddress?: string; userAgent?: string },
  ): Promise<TransferredRecordCounts> {
    return prisma.$transaction(
      async (tx) => {
        // 1. Kiểm tra hai người dùng
        const sourceUser = await tx.user.findUnique({
          where: { id: sourceUserId },
          select: { id: true, isActive: true, deletedAt: true },
        });
        const targetUser = await tx.user.findUnique({
          where: { id: targetUserId },
          select: { id: true, isActive: true, deletedAt: true },
        });

        if (!sourceUser || !targetUser || !targetUser.isActive || targetUser.deletedAt !== null) {
          throw new Error('Tài khoản chuyển hoặc nhận không hợp lệ hoặc đã bị vô hiệu hóa');
        }

        // 2. Hòa hợp Danh mục (Categories)
        const sourceCategories = await tx.category.findMany({
          where: { userId: sourceUserId },
        });
        const targetCategories = await tx.category.findMany({
          where: { userId: targetUserId },
        });

        let transferredCategoriesCount = 0;

        for (const catA of sourceCategories) {
          const matchingCatB = targetCategories.find(
            (cb) => cb.name.toLowerCase() === catA.name.toLowerCase() && cb.type === catA.type,
          );

          if (matchingCatB) {
            // Danh mục trùng tên & loại: Chuyển toàn bộ tham chiếu sang danh mục của User B rồi xóa catA
            await tx.transaction.updateMany({
              where: { userId: sourceUserId, categoryId: catA.id },
              data: { categoryId: matchingCatB.id },
            });
            await tx.budget.updateMany({
              where: { userId: sourceUserId, categoryId: catA.id },
              data: { categoryId: matchingCatB.id },
            });
            await tx.recurringTransactionSchedule.updateMany({
              where: { userId: sourceUserId, categoryId: catA.id },
              data: { categoryId: matchingCatB.id },
            });
            await tx.category.delete({
              where: { id: catA.id },
            });
          } else {
            // Danh mục duy nhất: Chuyển quyền sở hữu sang User B
            await tx.category.update({
              where: { id: catA.id },
              data: { userId: targetUserId },
            });
            transferredCategoriesCount++;
          }
        }

        // 3. Hòa hợp Ví tiền (Wallets) - Chống vi phạm @@unique([userId, name])
        const sourceWallets = await tx.wallet.findMany({
          where: { userId: sourceUserId },
        });
        const targetWallets = await tx.wallet.findMany({
          where: { userId: targetUserId },
        });
        const targetWalletNames = new Set(targetWallets.map((w) => w.name.toLowerCase()));

        for (const walletA of sourceWallets) {
          if (targetWalletNames.has(walletA.name.toLowerCase())) {
            // Đổi tên ví để tránh trùng lặp
            let newName = `${walletA.name} (Từ TK cũ)`;
            let counter = 1;
            while (targetWalletNames.has(newName.toLowerCase())) {
              newName = `${walletA.name} (Từ TK cũ ${counter++})`;
            }
            targetWalletNames.add(newName.toLowerCase());

            await tx.wallet.update({
              where: { id: walletA.id },
              data: {
                name: newName,
                userId: targetUserId,
                isDefault: false,
              },
            });
          } else {
            await tx.wallet.update({
              where: { id: walletA.id },
              data: {
                userId: targetUserId,
              },
            });
          }
        }

        // 4. Đổi chủ Giao dịch (Transactions)
        const transactionsCount = await tx.transaction.count({
          where: { userId: sourceUserId },
        });
        await tx.transaction.updateMany({
          where: { userId: sourceUserId },
          data: { userId: targetUserId },
        });

        // 5. Đổi chủ Chuyển tiền (Transfers)
        const transfersCount = await tx.transfer.count({
          where: { userId: sourceUserId },
        });
        await tx.transfer.updateMany({
          where: { userId: sourceUserId },
          data: { userId: targetUserId },
        });

        // 6. Đổi chủ Ngân sách (Budgets)
        const budgetsCount = await tx.budget.count({
          where: { userId: sourceUserId },
        });
        await tx.budget.updateMany({
          where: { userId: sourceUserId },
          data: { userId: targetUserId },
        });

        // 7. Đổi chủ Mục tiêu tiết kiệm (Saving Goals)
        const savingGoalsCount = await tx.savingGoal.count({
          where: { userId: sourceUserId },
        });
        await tx.savingGoal.updateMany({
          where: { userId: sourceUserId },
          data: { userId: targetUserId },
        });

        // 8. Đổi chủ Lịch định kỳ (Recurring Schedules)
        const recurringSchedulesCount = await tx.recurringTransactionSchedule.count({
          where: { userId: sourceUserId },
        });
        await tx.recurringTransactionSchedule.updateMany({
          where: { userId: sourceUserId },
          data: { userId: targetUserId },
        });

        // 9. Đổi chủ Lời nhắc (Reminders)
        const remindersCount = await tx.reminder.count({
          where: { userId: sourceUserId },
        });
        await tx.reminder.updateMany({
          where: { userId: sourceUserId },
          data: { userId: targetUserId },
        });

        // 10. Chuyển Thông báo (Notifications) - Xử lý trùng dedupKey
        const targetNotifications = await tx.notification.findMany({
          where: { userId: targetUserId },
          select: { dedupKey: true },
        });
        const targetDedupKeys = new Set(targetNotifications.map((n) => n.dedupKey));

        const sourceNotifications = await tx.notification.findMany({
          where: { userId: sourceUserId },
          select: { id: true, dedupKey: true },
        });

        for (const notif of sourceNotifications) {
          if (targetDedupKeys.has(notif.dedupKey)) {
            // Xóa thông báo trùng dedupKey từ tài khoản cũ
            await tx.notification.delete({ where: { id: notif.id } });
          }
        }
        await tx.notification.updateMany({
          where: { userId: sourceUserId },
          data: { userId: targetUserId },
        });

        // 11. Hủy bỏ & Khóa tài khoản User A (Decommission)
        await tx.refreshToken.deleteMany({
          where: { userId: sourceUserId },
        });
        await tx.userDevice.deleteMany({
          where: { userId: sourceUserId },
        });
        await tx.user.update({
          where: { id: sourceUserId },
          data: {
            isActive: false,
            deletedAt: new Date(),
          },
        });

        const recordCounts: TransferredRecordCounts = {
          wallets: sourceWallets.length,
          categories: transferredCategoriesCount,
          transactions: transactionsCount,
          transfers: transfersCount,
          budgets: budgetsCount,
          savingGoals: savingGoalsCount,
          recurringSchedules: recurringSchedulesCount,
          reminders: remindersCount,
        };

        // 12. Ghi AuditLog
        await tx.auditLog.create({
          data: {
            actorId: sourceUserId,
            action: 'HANDOVER_COMPLETED',
            targetType: 'HANDOVER',
            targetId: targetUserId,
            newState: {
              sourceUserId,
              targetUserId,
              transferredAt: new Date().toISOString(),
              recordCounts,
            },
            ipAddress: metadata?.ipAddress,
            userAgent: metadata?.userAgent,
          },
        });

        return recordCounts;
      },
      {
        isolationLevel: 'Serializable',
        timeout: 60000,
      },
    );
  }
}
