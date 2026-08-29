import {
  NotificationChannel,
  NotificationDeliveryStatus,
  NotificationPriority,
  NotificationType,
} from '@prisma/client';

export interface NotificationOverviewStatsDto {
  totalNotifications: number;
  totalSent: number;
  totalPending: number;
  totalFailed: number;
  totalSkipped: number;
  totalRead: number;
  totalUnread: number;
  deliverySuccessRate: number; // percentage e.g. 98.5
  deliveryFailureRate: number; // percentage e.g. 1.5
  channelBreakdown: Array<{
    channel: NotificationChannel;
    total: number;
    sent: number;
    failed: number;
    pending: number;
    skipped: number;
  }>;
  typeBreakdown: Array<{
    type: NotificationType;
    count: number;
  }>;
}

export interface AdminDeliveryQueryDto {
  channel?: NotificationChannel;
  status?: NotificationDeliveryStatus;
  type?: NotificationType;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'nextAttemptAt' | 'sentAt';
  order?: 'asc' | 'desc';
}

export interface AdminDeliveryItemDto {
  id: string;
  notificationId: string;
  channel: NotificationChannel;
  status: NotificationDeliveryStatus;
  attemptCount: number;
  nextAttemptAt: Date;
  sentAt: Date | null;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  notification: {
    id: string;
    type: NotificationType;
    priority: NotificationPriority;
    title: string;
    message: string;
    createdAt: Date;
  };
  user: {
    id: string;
    email: string | null;
    fullName: string | null;
  };
}

export interface AdminTemplateQueryDto {
  type?: NotificationType;
  channel?: NotificationChannel;
  language?: string;
  isActive?: boolean;
}

export interface UpdateTemplateDto {
  titleTemplate?: string;
  bodyTemplate?: string;
  isActive?: boolean;
}

export interface NotificationChannelConfigDto {
  inAppEnabled: boolean;
  emailEnabled: boolean;
  zaloEnabled: boolean;
  pushEnabled: boolean;
}
