import { Request, Response, NextFunction } from 'express';
import { apiKeyMiddleware } from './api-key.middleware';
import { prisma } from '../database/prisma.client';
import { generateApiKey } from '../common/helpers/crypto.helper';
import { rbacService } from '../modules/rbac/rbac.service';
import { AppError } from '../common/errors/app-error';
import { ApiKeyStatus } from '@prisma/client';

jest.mock('../database/prisma.client', () => ({
  prisma: {
    apiKey: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
  },
}));

jest.mock('../modules/rbac/rbac.service', () => ({
  rbacService: {
    getUserPermissions: jest.fn(),
  },
}));

describe('apiKeyMiddleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: jest.Mock;

  beforeEach(() => {
    req = {
      headers: {},
    };
    res = {};
    next = jest.fn();
    jest.clearAllMocks();
  });

  it('should throw UNAUTHORIZED when no API key header is provided', async () => {
    await apiKeyMiddleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('should authenticate valid API Key from X-API-Key header', async () => {
    const { rawKey, keyHash, keyPrefix } = generateApiKey();
    req.headers = { 'x-api-key': rawKey };

    const mockApiKey = {
      id: 'key-123',
      name: 'Integration Key',
      keyPrefix,
      keyHash,
      permissions: ['TRANSACTION_CREATE'],
      status: ApiKeyStatus.ACTIVE,
      expiresAt: null,
      deletedAt: null,
      user: {
        id: 'user-456',
        email: 'user@example.com',
        isActive: true,
        deletedAt: null,
        role: { name: 'USER' },
      },
    };

    (prisma.apiKey.findUnique as jest.Mock).mockResolvedValue(mockApiKey);
    (rbacService.getUserPermissions as jest.Mock).mockResolvedValue([
      'TRANSACTION_CREATE',
      'TRANSACTION_READ',
      'WALLET_READ',
    ]);

    await apiKeyMiddleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.user).toEqual({
      id: 'user-456',
      email: 'user@example.com',
      role: 'USER',
      permissions: ['TRANSACTION_CREATE'], // Intersected with apiKey.permissions
      apiKeyId: 'key-123',
    });
  });

  it('should reject when API key is expired', async () => {
    const { rawKey, keyHash } = generateApiKey();
    req.headers = { 'x-api-key': rawKey };

    const mockApiKey = {
      id: 'key-123',
      keyHash,
      status: ApiKeyStatus.ACTIVE,
      expiresAt: new Date(Date.now() - 10000), // Expired in past
      deletedAt: null,
      user: { id: 'user-456', isActive: true, deletedAt: null, role: { name: 'USER' } },
    };

    (prisma.apiKey.findUnique as jest.Mock).mockResolvedValue(mockApiKey);

    await apiKeyMiddleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('API_KEY_EXPIRED');
  });

  it('should allow request when client IP is in ipWhitelist', async () => {
    const { rawKey, keyHash, keyPrefix } = generateApiKey();
    req.headers = { 'x-api-key': rawKey, 'x-forwarded-for': '203.113.130.1' };

    const mockApiKey = {
      id: 'key-123',
      name: 'IP Restricted Key',
      keyPrefix,
      keyHash,
      permissions: ['TRANSACTION_READ'],
      ipWhitelist: ['203.113.130.1', '198.51.100.2'],
      status: ApiKeyStatus.ACTIVE,
      expiresAt: null,
      deletedAt: null,
      user: {
        id: 'user-456',
        email: 'user@example.com',
        isActive: true,
        deletedAt: null,
        role: { name: 'USER' },
      },
    };

    (prisma.apiKey.findUnique as jest.Mock).mockResolvedValue(mockApiKey);
    (rbacService.getUserPermissions as jest.Mock).mockResolvedValue(['TRANSACTION_READ']);

    await apiKeyMiddleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.user?.apiKeyId).toBe('key-123');
  });

  it('should reject with FORBIDDEN when client IP is not in ipWhitelist', async () => {
    const { rawKey, keyHash, keyPrefix } = generateApiKey();
    req.headers = { 'x-api-key': rawKey, 'x-forwarded-for': '1.2.3.4' };

    const mockApiKey = {
      id: 'key-123',
      name: 'IP Restricted Key',
      keyPrefix,
      keyHash,
      permissions: ['TRANSACTION_READ'],
      ipWhitelist: ['203.113.130.1'],
      status: ApiKeyStatus.ACTIVE,
      expiresAt: null,
      deletedAt: null,
      user: {
        id: 'user-456',
        email: 'user@example.com',
        isActive: true,
        deletedAt: null,
        role: { name: 'USER' },
      },
    };

    (prisma.apiKey.findUnique as jest.Mock).mockResolvedValue(mockApiKey);

    await apiKeyMiddleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
  });
});
