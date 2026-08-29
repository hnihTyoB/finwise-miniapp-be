import { SettingCategory, SettingType } from '@prisma/client';

export interface SystemSettingDto {
  key: string;
  value: string;
  type: SettingType;
  category: SettingCategory;
  description: string;
  isEditable: boolean;
  isPublic: boolean;
  updatedBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SystemSettingQueryDto {
  category?: SettingCategory;
  search?: string;
  isPublic?: boolean;
}

export interface UpdateSystemSettingDto {
  value: string | number | boolean | Record<string, unknown>;
}

export interface PublicConfigDto {
  maintenance: {
    enabled: boolean;
    message: string;
    startAt: string | null;
    endAt: string | null;
  };
  features: {
    aiAssistant: boolean;
    forecasting: boolean;
    anomalies: boolean;
    query: boolean;
    inAppNotifications: boolean;
    emailNotifications: boolean;
  };
  general: {
    defaultTimezone: string;
    defaultCurrency: string;
  };
}
