import { AppError } from '../../common/errors/app-error';
import { ERROR_CODE } from '../../common/errors/error-code';
import { envConfig } from '../../config/env.config';
import { rbacRepository } from '../rbac/rbac.repository';
import { systemSettingService } from '../system-settings/system-setting.service';
import {
  AiFeatureKey,
  AiFeatureStatusDto,
  AiRateLimitConfigDto,
  AiRequestLogQueryDto,
  UpdateAiRateLimitDto,
} from './admin-ai.dto';
import {
  adminAiRepository,
  AdminAiRepository,
} from './admin-ai.repository';

export class AdminAiService {
  constructor(
    private readonly repository: AdminAiRepository = adminAiRepository,
  ) {}

  async getFeatureStatuses(): Promise<AiFeatureStatusDto[]> {
    const isGeminiConfigured = envConfig.ai.geminiApiKeys.length > 0;

    const [
      assistantEnabled,
      forecastingEnabled,
      anomaliesEnabled,
      queryEnabled,
    ] = await Promise.all([
      systemSettingService.getBoolean('ai.assistant.enabled', true),
      systemSettingService.getBoolean('ai.forecasting.enabled', true),
      systemSettingService.getBoolean('ai.anomalies.enabled', true),
      systemSettingService.getBoolean('ai.query.enabled', true),
    ]);

    const features: Array<{
      key: AiFeatureKey;
      name: string;
      enabled: boolean;
      settingKey: string;
      description: string;
      requiresLlm: boolean;
    }> = [
      {
        key: 'assistant',
        name: 'Trợ lý tài chính AI Assistant',
        enabled: assistantEnabled,
        settingKey: 'ai.assistant.enabled',
        description: 'Trò chuyện, phân loại giao dịch, trích xuất hóa đơn và phân tích tài chính',
        requiresLlm: true,
      },
      {
        key: 'forecasting',
        name: 'Dự báo dòng tiền & cạn kiệt ngân sách',
        enabled: forecastingEnabled,
        settingKey: 'ai.forecasting.enabled',
        description: 'Mô hình dự báo Holt-Winters và tính toán tốc độ đốt tiền xác định',
        requiresLlm: false,
      },
      {
        key: 'anomalies',
        name: 'Phát hiện chi tiêu bất thường',
        enabled: anomaliesEnabled,
        settingKey: 'ai.anomalies.enabled',
        description: 'Thuật toán Modified Z-score (MAD) và phát hiện bùng nổ giao dịch',
        requiresLlm: false,
      },
      {
        key: 'query',
        name: 'Truy vấn ngôn ngữ tự nhiên DSL',
        enabled: queryEnabled,
        settingKey: 'ai.query.enabled',
        description: 'Trình biên dịch truy vấn ngôn ngữ tự nhiên thành AST và tổng hợp dữ liệu',
        requiresLlm: false,
      },
    ];

    return features.map((f) => {
      let status: 'ENABLED' | 'DISABLED' | 'DEGRADED' = 'DISABLED';

      if (f.enabled) {
        if (f.requiresLlm && !isGeminiConfigured) {
          status = 'DEGRADED';
        } else {
          status = 'ENABLED';
        }
      }

      return {
        key: f.key,
        name: f.name,
        enabled: f.enabled,
        status,
        settingKey: f.settingKey,
        provider: envConfig.ai.provider,
        model: envConfig.ai.geminiModel,
        description: f.description,
      };
    });
  }

  async toggleFeature(
    featureKey: string,
    enabled: boolean,
    actorId?: string,
    meta?: { ipAddress?: string; userAgent?: string },
  ): Promise<AiFeatureStatusDto> {
    const validFeatures: Record<string, { settingKey: string; name: string }> = {
      assistant: { settingKey: 'ai.assistant.enabled', name: 'Trợ lý AI Assistant' },
      forecasting: { settingKey: 'ai.forecasting.enabled', name: 'Dự báo dòng tiền' },
      anomalies: { settingKey: 'ai.anomalies.enabled', name: 'Phát hiện chi tiêu bất thường' },
      query: { settingKey: 'ai.query.enabled', name: 'Truy vấn DSL ngôn ngữ tự nhiên' },
    };

    const target = validFeatures[featureKey.toLowerCase()];
    if (!target) {
      throw new AppError(`Tính năng AI [${featureKey}] không tồn tại`, 404, ERROR_CODE.NOT_FOUND);
    }

    const previousEnabled = await systemSettingService.getBoolean(target.settingKey, true);

    await systemSettingService.updateSetting(
      target.settingKey,
      { value: enabled },
      actorId,
      meta,
    );

    await rbacRepository.createAuditLog({
      actorId,
      action: 'AI_CONFIG_UPDATE',
      targetType: 'AI_FEATURE',
      targetId: featureKey,
      previousState: { enabled: previousEnabled },
      newState: { enabled },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });

    const statuses = await this.getFeatureStatuses();
    return statuses.find((s) => s.key === featureKey.toLowerCase())!;
  }

  async getUsageSummary(period: 'today' | 'week' | 'month' = 'today') {
    const now = new Date();
    let fromDate: Date;

    if (period === 'today') {
      // Vietnam business day start (UTC+7)
      const vietnamDate = new Date(now.getTime() + 7 * 60 * 60 * 1000);
      vietnamDate.setUTCHours(0, 0, 0, 0);
      fromDate = new Date(vietnamDate.getTime() - 7 * 60 * 60 * 1000);
    } else if (period === 'week') {
      fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else {
      fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    return this.repository.getUsageSummary(fromDate, now, period);
  }

  async findLogs(query: AiRequestLogQueryDto) {
    return this.repository.findLogs(query);
  }

  async getRateLimitConfig(): Promise<AiRateLimitConfigDto> {
    const [maxRequests, windowMs] = await Promise.all([
      systemSettingService.getNumber('ai.rate_limit.max_requests', 20),
      systemSettingService.getNumber('ai.rate_limit.window_ms', 900000),
    ]);

    return {
      maxRequests,
      windowMs,
    };
  }

  async updateRateLimitConfig(
    dto: UpdateAiRateLimitDto,
    actorId?: string,
    meta?: { ipAddress?: string; userAgent?: string },
  ): Promise<AiRateLimitConfigDto> {
    const previousConfig = await this.getRateLimitConfig();

    await Promise.all([
      systemSettingService.updateSetting(
        'ai.rate_limit.max_requests',
        { value: dto.maxRequests },
        actorId,
        meta,
      ),
      systemSettingService.updateSetting(
        'ai.rate_limit.window_ms',
        { value: dto.windowMs },
        actorId,
        meta,
      ),
    ]);

    const newConfig = {
      maxRequests: dto.maxRequests,
      windowMs: dto.windowMs,
    };

    await rbacRepository.createAuditLog({
      actorId,
      action: 'AI_CONFIG_UPDATE',
      targetType: 'AI_RATE_LIMIT',
      targetId: 'global',
      previousState: previousConfig,
      newState: newConfig,
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });

    return newConfig;
  }
}

export const adminAiService = new AdminAiService();
