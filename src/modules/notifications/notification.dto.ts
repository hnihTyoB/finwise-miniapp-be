import {
  NotificationChannel,
  NotificationPriority,
  NotificationSourceType,
  NotificationType,
} from '@prisma/client';

export interface NotificationQueryDto {
  type?: NotificationType;
  priority?: NotificationPriority;
  isRead?: boolean;
  page: number;
  limit: number;
}

export interface UpdateNotificationSettingDto {
  channels?: NotificationChannel[];
  /** chat_id nhận được khi user nhắn tin cho Zalo Bot. null = bỏ liên kết. */
  zaloBotChatId?: string | null;
  budgetAlertsEnabled?: boolean;
  savingGoalAlertsEnabled?: boolean;
  reminderAlertsEnabled?: boolean;
  unusualTxnAlertsEnabled?: boolean;
}

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  priority?: NotificationPriority;
  title: string;
  message: string;
  actionUrl?: string | null;
  sourceType?: NotificationSourceType | null;
  sourceId?: string | null;
  data?: Record<string, string | number | boolean | null>;
  dedupKey: string;
  expiresAt?: Date | null;
}

export interface NotificationSettingDto {
  channels: NotificationChannel[];
  /** chat_id của Zalo Bot, null nếu chưa liên kết. */
  zaloBotChatId: string | null;
  budgetAlertsEnabled: boolean;
  savingGoalAlertsEnabled: boolean;
  reminderAlertsEnabled: boolean;
  unusualTxnAlertsEnabled: boolean;
}

export const DEFAULT_NOTIFICATION_SETTING: NotificationSettingDto = {
  channels: [NotificationChannel.IN_APP],
  zaloBotChatId: null,
  budgetAlertsEnabled: true,
  savingGoalAlertsEnabled: true,
  reminderAlertsEnabled: true,
  unusualTxnAlertsEnabled: true,
};
