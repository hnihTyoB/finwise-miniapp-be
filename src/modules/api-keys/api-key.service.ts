import { ApiKeyRepository } from './api-key.repository';
import { CreateApiKeyDto, CreateApiKeyResponseDto, ApiKeyResponseDto } from './api-key.dto';
import { generateApiKey } from '../../common/helpers/crypto.helper';
import { AppError } from '../../common/errors/app-error';
import { ERROR_CODE } from '../../common/errors/error-code';

export class ApiKeyService {
  private readonly repository = new ApiKeyRepository();

  async createApiKey(userId: string, data: CreateApiKeyDto): Promise<CreateApiKeyResponseDto> {
    const { rawKey, keyPrefix, keyHash } = generateApiKey();
    const expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;

    const apiKey = await this.repository.create({
      userId,
      name: data.name.trim(),
      keyPrefix,
      keyHash,
      permissions: data.permissions || [],
      ipWhitelist: data.ipWhitelist || [],
      expiresAt,
    });

    return {
      apiKey: {
        id: apiKey.id,
        name: apiKey.name,
        keyPrefix: apiKey.keyPrefix,
        permissions: apiKey.permissions,
        ipWhitelist: apiKey.ipWhitelist,
        status: apiKey.status,
        lastUsedAt: apiKey.lastUsedAt,
        expiresAt: apiKey.expiresAt,
        createdAt: apiKey.createdAt,
        updatedAt: apiKey.updatedAt,
      },
      rawKey,
    };
  }

  async getUserApiKeys(userId: string): Promise<ApiKeyResponseDto[]> {
    const keys = await this.repository.findByUserId(userId);
    return keys.map((k) => ({
      id: k.id,
      name: k.name,
      keyPrefix: k.keyPrefix,
      permissions: k.permissions,
      ipWhitelist: k.ipWhitelist,
      status: k.status,
      lastUsedAt: k.lastUsedAt,
      expiresAt: k.expiresAt,
      createdAt: k.createdAt,
      updatedAt: k.updatedAt,
    }));
  }

  async revokeApiKey(userId: string, id: string): Promise<void> {
    const revoked = await this.repository.revoke(id, userId);
    if (!revoked) {
      throw new AppError('API Key not found', 404, ERROR_CODE.NOT_FOUND);
    }
  }
}
