import { AppError } from '../../common/errors/app-error';
import { ERROR_CODE } from '../../common/errors/error-code';
import { rbacRepository } from '../rbac/rbac.repository';
import { systemSettingService } from '../system-settings/system-setting.service';
import {
  AdminDeliveryQueryDto,
  AdminTemplateQueryDto,
  NotificationChannelConfigDto,
  UpdateTemplateDto,
} from './admin-notification.dto';
import {
  adminNotificationRepository,
  AdminNotificationRepository,
} from './admin-notification.repository';

export class AdminNotificationService {
  constructor(
    private readonly repository: AdminNotificationRepository = adminNotificationRepository,
  ) {}

  async getOverviewStats(dateFrom?: string, dateTo?: string) {
    const from = dateFrom ? new Date(dateFrom) : undefined;
    const to = dateTo ? new Date(dateTo) : undefined;
    return this.repository.getOverviewStats(from, to);
  }

  async findDeliveries(query: AdminDeliveryQueryDto) {
    return this.repository.findDeliveries(query);
  }

  async retryDelivery(
    id: string,
    actorId?: string,
    meta?: { ipAddress?: string; userAgent?: string },
  ) {
    const delivery = await this.repository.findDeliveryById(id);
    if (!delivery) {
      throw new AppError('Bản ghi phân phối thông báo không tồn tại', 404, ERROR_CODE.NOT_FOUND);
    }

    const previousState = {
      status: delivery.status,
      attemptCount: delivery.attemptCount,
      failureReason: delivery.failureReason,
    };

    const updated = await this.repository.retryDelivery(id);

    await rbacRepository.createAuditLog({
      actorId,
      action: 'NOTIFICATION_RETRY',
      targetType: 'NOTIFICATION_DELIVERY',
      targetId: id,
      previousState,
      newState: {
        status: updated.status,
        nextAttemptAt: updated.nextAttemptAt,
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });

    return updated;
  }

  async findTemplates(query?: AdminTemplateQueryDto) {
    return this.repository.findTemplates(query);
  }

  async updateTemplate(
    id: string,
    dto: UpdateTemplateDto,
    actorId?: string,
    meta?: { ipAddress?: string; userAgent?: string },
  ) {
    const existing = await this.repository.findTemplateById(id);
    if (!existing) {
      throw new AppError('Mẫu thông báo không tồn tại', 404, ERROR_CODE.NOT_FOUND);
    }

    const updated = await this.repository.updateTemplate(id, dto);

    await rbacRepository.createAuditLog({
      actorId,
      action: 'NOTIFICATION_TEMPLATE_UPDATE',
      targetType: 'NOTIFICATION_TEMPLATE',
      targetId: id,
      previousState: {
        titleTemplate: existing.titleTemplate,
        bodyTemplate: existing.bodyTemplate,
        isActive: existing.isActive,
      },
      newState: {
        titleTemplate: updated.titleTemplate,
        bodyTemplate: updated.bodyTemplate,
        isActive: updated.isActive,
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });

    return updated;
  }

  async getChannelConfig(): Promise<NotificationChannelConfigDto> {
    const [inAppEnabled, emailEnabled, zaloEnabled, pushEnabled] = await Promise.all([
      systemSettingService.getBoolean('notifications.in_app_enabled', true),
      systemSettingService.getBoolean('notifications.email_enabled', true),
      systemSettingService.getBoolean('notifications.zalo_enabled', false),
      systemSettingService.getBoolean('notifications.push_enabled', false),
    ]);

    return {
      inAppEnabled,
      emailEnabled,
      zaloEnabled,
      pushEnabled,
    };
  }

  async updateChannelConfig(
    data: Partial<NotificationChannelConfigDto>,
    actorId?: string,
    meta?: { ipAddress?: string; userAgent?: string },
  ): Promise<NotificationChannelConfigDto> {
    const previousConfig = await this.getChannelConfig();

    if (data.inAppEnabled !== undefined) {
      await systemSettingService.updateSetting(
        'notifications.in_app_enabled',
        { value: data.inAppEnabled },
        actorId,
        meta,
      );
    }

    if (data.emailEnabled !== undefined) {
      await systemSettingService.updateSetting(
        'notifications.email_enabled',
        { value: data.emailEnabled },
        actorId,
        meta,
      );
    }

    if (data.zaloEnabled !== undefined) {
      await systemSettingService.updateSetting(
        'notifications.zalo_enabled',
        { value: data.zaloEnabled },
        actorId,
        meta,
      );
    }

    if (data.pushEnabled !== undefined) {
      await systemSettingService.updateSetting(
        'notifications.push_enabled',
        { value: data.pushEnabled },
        actorId,
        meta,
      );
    }

    const newConfig = await this.getChannelConfig();

    await rbacRepository.createAuditLog({
      actorId,
      action: 'NOTIFICATION_CONFIG_UPDATE',
      targetType: 'NOTIFICATION_CONFIG',
      targetId: 'channels',
      previousState: previousConfig,
      newState: newConfig,
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });

    return newConfig;
  }
}

export const adminNotificationService = new AdminNotificationService();
