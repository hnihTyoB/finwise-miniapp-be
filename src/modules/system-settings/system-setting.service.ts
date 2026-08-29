import { SettingType } from '@prisma/client';
import { AppError } from '../../common/errors/app-error';
import { ERROR_CODE } from '../../common/errors/error-code';
import { cacheService } from '../../common/services/cache.service';
import { rbacRepository } from '../rbac/rbac.repository';
import {
  PublicConfigDto,
  SystemSettingDto,
  SystemSettingQueryDto,
  UpdateSystemSettingDto,
} from './system-setting.dto';
import { SystemSettingRepository } from './system-setting.repository';

const CACHE_PREFIX = 'system-settings:';
const CACHE_TTL_SECONDS = 600; // 10 minutes

export class SystemSettingService {
  private readonly repository = new SystemSettingRepository();

  async findAll(query?: SystemSettingQueryDto): Promise<SystemSettingDto[]> {
    return this.repository.findAll(query);
  }

  async findByKey(key: string): Promise<SystemSettingDto> {
    const setting = await this.repository.findByKey(key);
    if (!setting) {
      throw new AppError(`Cài đặt hệ thống [${key}] không tồn tại`, 404, ERROR_CODE.NOT_FOUND);
    }
    return setting;
  }

  async getRawValue(key: string): Promise<string | null> {
    const cacheKey = `${CACHE_PREFIX}${key}`;
    const cached = await cacheService.get<string>(cacheKey);
    if (cached !== null && cached !== undefined) {
      return cached;
    }

    const setting = await this.repository.findByKey(key);
    if (!setting) {
      return null;
    }

    await cacheService.set(cacheKey, setting.value, CACHE_TTL_SECONDS);
    return setting.value;
  }

  async getBoolean(key: string, defaultValue = false): Promise<boolean> {
    const raw = await this.getRawValue(key);
    if (raw === null) return defaultValue;
    return raw === 'true' || raw === '1';
  }

  async getNumber(key: string, defaultValue = 0): Promise<number> {
    const raw = await this.getRawValue(key);
    if (raw === null) return defaultValue;
    const num = Number(raw);
    return Number.isFinite(num) ? num : defaultValue;
  }

  async getString(key: string, defaultValue = ''): Promise<string> {
    const raw = await this.getRawValue(key);
    return raw ?? defaultValue;
  }

  async updateSetting(
    key: string,
    dto: UpdateSystemSettingDto,
    actorId?: string,
    meta?: { ipAddress?: string; userAgent?: string },
  ): Promise<SystemSettingDto> {
    const existing = await this.findByKey(key);

    if (!existing.isEditable) {
      throw new AppError(
        `Cài đặt [${key}] là thông số bất biến và không thể chỉnh sửa`,
        400,
        ERROR_CODE.VALIDATION_ERROR,
      );
    }

    const serializedValue = this.validateAndSerialize(existing.type, dto.value);

    // Persist to Database
    const updated = await this.repository.updateSetting(key, serializedValue, actorId);

    // Invalidate Cache
    const cacheKey = `${CACHE_PREFIX}${key}`;
    await cacheService.del(cacheKey);

    // Log Audit
    await rbacRepository.createAuditLog({
      actorId,
      action: 'SYSTEM_CONFIG_UPDATE',
      targetType: 'SYSTEM_SETTING',
      targetId: key,
      previousState: { value: existing.value },
      newState: { value: serializedValue },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });

    return updated;
  }

  async updateMaintenanceMode(
    input: { enabled: boolean; message?: string; startAt?: string | null; endAt?: string | null },
    actorId?: string,
    meta?: { ipAddress?: string; userAgent?: string },
  ): Promise<PublicConfigDto['maintenance']> {
    const previousEnabled = await this.getBoolean('system.maintenance.enabled', false);

    await this.updateSetting(
      'system.maintenance.enabled',
      { value: input.enabled },
      actorId,
      meta,
    );

    if (input.message !== undefined) {
      await this.updateSetting(
        'system.maintenance.message',
        { value: input.message },
        actorId,
        meta,
      );
    }

    if (input.startAt !== undefined) {
      await this.updateSetting(
        'system.maintenance.start_at',
        { value: input.startAt ?? '' },
        actorId,
        meta,
      );
    }

    if (input.endAt !== undefined) {
      await this.updateSetting(
        'system.maintenance.end_at',
        { value: input.endAt ?? '' },
        actorId,
        meta,
      );
    }

    // Special Audit Log for Maintenance Mode Trigger
    await rbacRepository.createAuditLog({
      actorId,
      action: 'MAINTENANCE_MODE_UPDATE',
      targetType: 'SYSTEM_SETTING',
      targetId: 'system.maintenance',
      previousState: { enabled: previousEnabled },
      newState: {
        enabled: input.enabled,
        message: input.message,
        startAt: input.startAt,
        endAt: input.endAt,
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });

    return {
      enabled: input.enabled,
      message: (await this.getString('system.maintenance.message')) || '',
      startAt: (await this.getString('system.maintenance.start_at')) || null,
      endAt: (await this.getString('system.maintenance.end_at')) || null,
    };
  }

  async getPublicConfig(): Promise<PublicConfigDto> {
    const [
      maintenanceEnabled,
      maintenanceMessage,
      maintenanceStartAt,
      maintenanceEndAt,
      aiAssistant,
      forecasting,
      anomalies,
      query,
      inAppNotifications,
      emailNotifications,
      defaultTimezone,
      defaultCurrency,
    ] = await Promise.all([
      this.getBoolean('system.maintenance.enabled', false),
      this.getString(
        'system.maintenance.message',
        'Hệ thống FinWise đang bảo trì để nâng cấp định kỳ. Vui lòng quay lại sau ít phút.',
      ),
      this.getString('system.maintenance.start_at', ''),
      this.getString('system.maintenance.end_at', ''),
      this.getBoolean('ai.assistant.enabled', true),
      this.getBoolean('ai.forecasting.enabled', true),
      this.getBoolean('ai.anomalies.enabled', true),
      this.getBoolean('ai.query.enabled', true),
      this.getBoolean('notifications.in_app_enabled', true),
      this.getBoolean('notifications.email_enabled', true),
      this.getString('general.default_timezone', 'Asia/Ho_Chi_Minh'),
      this.getString('general.default_currency', 'VND'),
    ]);

    return {
      maintenance: {
        enabled: maintenanceEnabled,
        message: maintenanceMessage,
        startAt: maintenanceStartAt || null,
        endAt: maintenanceEndAt || null,
      },
      features: {
        aiAssistant,
        forecasting,
        anomalies,
        query,
        inAppNotifications,
        emailNotifications,
      },
      general: {
        defaultTimezone,
        defaultCurrency,
      },
    };
  }

  private validateAndSerialize(type: SettingType, value: unknown): string {
    switch (type) {
      case SettingType.BOOLEAN: {
        if (typeof value === 'boolean') {
          return value ? 'true' : 'false';
        }
        if (value === 'true' || value === '1' || value === 1) return 'true';
        if (value === 'false' || value === '0' || value === 0) return 'false';
        throw new AppError(
          'Giá trị không hợp lệ cho cấu hình kiểu BOOLEAN',
          400,
          ERROR_CODE.VALIDATION_ERROR,
        );
      }
      case SettingType.NUMBER: {
        const num = typeof value === 'number' ? value : Number(value);
        if (!Number.isFinite(num)) {
          throw new AppError(
            'Giá trị không hợp lệ cho cấu hình kiểu NUMBER',
            400,
            ERROR_CODE.VALIDATION_ERROR,
          );
        }
        return num.toString();
      }
      case SettingType.STRING: {
        if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
          throw new AppError(
            'Giá trị không hợp lệ cho cấu hình kiểu STRING',
            400,
            ERROR_CODE.VALIDATION_ERROR,
          );
        }
        return String(value);
      }
      case SettingType.JSON: {
        if (typeof value === 'object' && value !== null) {
          return JSON.stringify(value);
        }
        if (typeof value === 'string') {
          try {
            JSON.parse(value);
            return value;
          } catch {
            throw new AppError(
              'Giá trị chuỗi không phải định dạng JSON hợp lệ',
              400,
              ERROR_CODE.VALIDATION_ERROR,
            );
          }
        }
        throw new AppError(
          'Giá trị không hợp lệ cho cấu hình kiểu JSON',
          400,
          ERROR_CODE.VALIDATION_ERROR,
        );
      }
      default:
        return String(value);
    }
  }
}

export const systemSettingService = new SystemSettingService();
