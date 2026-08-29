import { ApiKeyStatus } from '@prisma/client';

export interface CreateApiKeyDto {
  name: string;
  permissions?: string[];
  ipWhitelist?: string[];
  expiresAt?: string | null;
}

export interface ApiKeyResponseDto {
  id: string;
  name: string;
  keyPrefix: string;
  permissions: string[];
  ipWhitelist: string[];
  status: ApiKeyStatus;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateApiKeyResponseDto {
  apiKey: ApiKeyResponseDto;
  rawKey: string; // Trả về raw secret key chỉ 1 lần duy nhất khi tạo
}
