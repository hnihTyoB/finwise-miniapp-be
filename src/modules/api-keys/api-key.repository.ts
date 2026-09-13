import { prisma } from '../../database/prisma.client';
import { ApiKey, ApiKeyStatus } from '@prisma/client';

export class ApiKeyRepository {
  async create(data: {
    userId: string;
    name: string;
    keyPrefix: string;
    keyHash: string;
    permissions: string[];
    ipWhitelist?: string[];
    expiresAt?: Date | null;
  }): Promise<ApiKey> {
    return prisma.apiKey.create({
      data: {
        userId: data.userId,
        name: data.name,
        keyPrefix: data.keyPrefix,
        keyHash: data.keyHash,
        permissions: data.permissions,
        ipWhitelist: data.ipWhitelist || [],
        expiresAt: data.expiresAt,
        status: ApiKeyStatus.ACTIVE,
      },
    });
  }

  async findByUserId(userId: string, limit = 50, skip = 0): Promise<ApiKey[]> {
    return prisma.apiKey.findMany({
      where: {
        userId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip,
    });
  }

  async findByIdAndUserId(id: string, userId: string): Promise<ApiKey | null> {
    return prisma.apiKey.findFirst({
      where: {
        id,
        userId,
        deletedAt: null,
      },
    });
  }

  async revoke(id: string, userId: string): Promise<ApiKey | null> {
    const existing = await this.findByIdAndUserId(id, userId);
    if (!existing) return null;

    return prisma.apiKey.update({
      where: { id },
      data: {
        status: ApiKeyStatus.REVOKED,
        deletedAt: new Date(),
      },
    });
  }
}
