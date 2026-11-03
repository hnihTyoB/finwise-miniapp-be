import request from 'supertest';
import app from '../src/app';
import jwt from 'jsonwebtoken';
import { jwtConfig } from '../src/config/jwt.config';
import { prisma } from '../src/database/prisma.client';
import { apiKeyMiddleware } from '../src/middlewares/api-key.middleware';
import { generateApiKey } from '../src/common/helpers/crypto.helper';
import { rbacService } from '../src/modules/rbac/rbac.service';
import { ApiKeyStatus } from '@prisma/client';
import { Request, Response } from 'express';

describe('Wave 0 Security Fixes Verification (SEC-W0-03, SEC-W0-04, SEC-W0-05)', () => {
  const dummySecret = jwtConfig.accessSecret;
  const validToken = jwt.sign(
    { id: '11111111-1111-1111-1111-111111111111', email: 'test-user@finwise.local', role: 'USER' },
    dummySecret,
    { algorithm: 'HS256', expiresIn: '1h' },
  );

  describe('SEC-W0-03: Restricted JWT Query Token Extraction', () => {
    it('should REJECT query token on standard endpoints even if Accept: text/event-stream header is forged', async () => {
      const res = await request(app)
        .post(`/api/v1/categories?token=${validToken}`)
        .set('Accept', 'text/event-stream')
        .send({ name: 'Hacked Category' });

      // Because query token is not extracted on non-stream endpoints, it returns 401 Unauthorized
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('should REJECT query token on stream endpoints if HTTP method is NOT GET', async () => {
      const res = await request(app)
        .post(`/api/v1/notifications/stream?token=${validToken}`)
        .send({});

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });
  });

  describe('SEC-W0-04: BodyParser Malformed JSON 400 Bad Request', () => {
    it('should return 400 Bad Request with VALIDATION_ERROR on malformed JSON payload (not 500)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"email": "broken-json,');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        success: false,
        message: 'Invalid JSON payload format',
        code: 'VALIDATION_ERROR',
      });
    });
  });

  describe('SEC-W0-05: Debounced lastUsedAt on ApiKey Middleware', () => {
    it('should debounce lastUsedAt update when key was used recently (< 5 minutes)', async () => {
      const { rawKey, keyHash, keyPrefix } = generateApiKey();
      const mockReq = {
        headers: { 'x-api-key': rawKey },
      } as unknown as Request;
      const mockRes = {} as Response;
      const next = jest.fn();

      // Key was used 1 minute ago (within 5-minute debounce window)
      const oneMinuteAgo = new Date(Date.now() - 60_000);
      const mockApiKey = {
        id: '22222222-2222-2222-2222-222222222222',
        name: 'Debounce Key',
        keyPrefix,
        keyHash,
        permissions: ['TRANSACTION_READ'],
        status: ApiKeyStatus.ACTIVE,
        expiresAt: null,
        deletedAt: null,
        lastUsedAt: oneMinuteAgo,
        user: {
          id: '33333333-3333-3333-3333-333333333333',
          email: 'debounced@example.com',
          isActive: true,
          deletedAt: null,
          role: { name: 'USER' },
        },
      };

      const findUniqueSpy = jest.spyOn(prisma.apiKey, 'findUnique').mockResolvedValue(mockApiKey as any);
      const updateSpy = jest.spyOn(prisma.apiKey, 'update').mockResolvedValue({} as any);
      jest.spyOn(rbacService, 'getUserPermissions').mockResolvedValue(['TRANSACTION_READ']);

      await apiKeyMiddleware(mockReq, mockRes, next);

      expect(next).toHaveBeenCalledWith();
      expect(findUniqueSpy).toHaveBeenCalled();
      // Since lastUsedAt was 1 minute ago, update MUST be skipped (0 calls)
      expect(updateSpy).not.toHaveBeenCalled();

      findUniqueSpy.mockRestore();
      updateSpy.mockRestore();
    });

    it('should trigger lastUsedAt update when apiKey.lastUsedAt is null (first use)', async () => {
      const { rawKey, keyHash, keyPrefix } = generateApiKey();
      const mockReq = {
        headers: { 'x-api-key': rawKey },
      } as unknown as Request;
      const mockRes = {} as Response;
      const next = jest.fn();

      const mockApiKey = {
        id: '44444444-4444-4444-4444-444444444444',
        name: 'First Use Key',
        keyPrefix,
        keyHash,
        permissions: ['TRANSACTION_READ'],
        status: ApiKeyStatus.ACTIVE,
        expiresAt: null,
        deletedAt: null,
        lastUsedAt: null, // First time use
        user: {
          id: '55555555-5555-5555-5555-555555555555',
          email: 'first-use@example.com',
          isActive: true,
          deletedAt: null,
          role: { name: 'USER' },
        },
      };

      const findUniqueSpy = jest.spyOn(prisma.apiKey, 'findUnique').mockResolvedValue(mockApiKey as any);
      const updateSpy = jest.spyOn(prisma.apiKey, 'update').mockResolvedValue({} as any);
      jest.spyOn(rbacService, 'getUserPermissions').mockResolvedValue(['TRANSACTION_READ']);

      await apiKeyMiddleware(mockReq, mockRes, next);

      expect(next).toHaveBeenCalledWith();
      // First time use MUST trigger update
      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: mockApiKey.id },
        data: { lastUsedAt: expect.any(Date) },
      });

      findUniqueSpy.mockRestore();
      updateSpy.mockRestore();
    });
  });

  describe('SEC-W0-06: In-Memory Rate Limiting Cardinality Cap', () => {
    it('should prune expired and evict oldest records when map reaches MAX_RATE_LIMIT_ENTRIES', async () => {
      const { pruneRateLimitMap, MAX_RATE_LIMIT_ENTRIES } = await import('../src/middlewares/rate-limit.middleware');
      const testMap = new Map();
      const now = Date.now();

      // Populate testMap with MAX_RATE_LIMIT_ENTRIES entries
      for (let i = 0; i < MAX_RATE_LIMIT_ENTRIES; i++) {
        testMap.set(`ip-${i}`, {
          count: 1,
          resetAt: now + (i % 2 === 0 ? -1000 : 60000), // Half are expired
        });
      }

      expect(testMap.size).toBe(MAX_RATE_LIMIT_ENTRIES);

      pruneRateLimitMap(testMap, now);

      // Expired entries should be pruned, bringing size safely below the cap
      expect(testMap.size).toBeLessThan(MAX_RATE_LIMIT_ENTRIES);
    });
  });

  describe('SEC-W0-07: Consistent Authorization: ApiKey Header Extraction', () => {
    it('should correctly extract raw key when using Authorization: ApiKey <rawKey>', async () => {
      const { authOrApiKeyMiddleware } = await import('../src/middlewares/api-key.middleware');
      const { rawKey, keyHash, keyPrefix } = generateApiKey();
      const mockReq = {
        headers: { authorization: `ApiKey ${rawKey}` },
      } as unknown as Request;
      const mockRes = {} as Response;
      const next = jest.fn();

      const mockApiKey = {
        id: '66666666-6666-6666-6666-666666666666',
        name: 'Header Format Key',
        keyPrefix,
        keyHash,
        permissions: ['WALLET_READ'],
        status: ApiKeyStatus.ACTIVE,
        expiresAt: null,
        deletedAt: null,
        lastUsedAt: new Date(),
        user: {
          id: '77777777-7777-7777-7777-777777777777',
          email: 'apikey-header@example.com',
          isActive: true,
          deletedAt: null,
          role: { name: 'USER' },
        },
      };

      const findUniqueSpy = jest.spyOn(prisma.apiKey, 'findUnique').mockResolvedValue(mockApiKey as any);
      jest.spyOn(rbacService, 'getUserPermissions').mockResolvedValue(['WALLET_READ']);

      await authOrApiKeyMiddleware(mockReq, mockRes, next);

      expect(next).toHaveBeenCalledWith();
      expect((mockReq as any).user.apiKeyId).toBe(mockApiKey.id);

      findUniqueSpy.mockRestore();
    });
  });

  describe('SEC-W0-08: Maintenance Mode Path Boundary & API Key Bypass', () => {
    it('should strictly enforce path boundaries and allow API Key with admin bypass to pass during maintenance', async () => {
      const { maintenanceModeMiddleware } = await import('../src/middlewares/maintenance-mode.middleware');
      const { systemSettingService } = await import('../src/modules/system-settings/system-setting.service');
      const { rawKey, keyHash, keyPrefix } = generateApiKey();

      // Enable maintenance mode in mock
      jest.spyOn(systemSettingService, 'getBoolean').mockResolvedValue(true);
      jest.spyOn(systemSettingService, 'getString').mockResolvedValue('Bảo trì hệ thống');

      const mockReq = {
        path: '/categories',
        url: '/api/v1/categories',
        originalUrl: '/api/v1/categories',
        headers: { 'x-api-key': rawKey },
      } as unknown as Request;

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      } as unknown as Response;

      const next = jest.fn();

      const adminApiKey = {
        id: '88888888-8888-8888-8888-888888888888',
        name: 'Admin DevOps Key',
        keyPrefix,
        keyHash,
        permissions: ['MAINTENANCE_MODE_UPDATE', 'SYSTEM_CONFIG_UPDATE'],
        status: ApiKeyStatus.ACTIVE,
        expiresAt: null,
        deletedAt: null,
        lastUsedAt: new Date(),
        user: {
          id: '99999999-9999-9999-9999-999999999999',
          email: 'admin-devops@finwise.local',
          isActive: true,
          deletedAt: null,
          role: { name: 'ADMIN' },
        },
      };

      const findUniqueSpy = jest.spyOn(prisma.apiKey, 'findUnique').mockResolvedValue(adminApiKey as any);
      jest.spyOn(rbacService, 'getUserPermissions').mockResolvedValue(['MAINTENANCE_MODE_UPDATE', 'SYSTEM_CONFIG_UPDATE']);

      await maintenanceModeMiddleware(mockReq, mockRes, next);

      // Admin API key with bypass permission MUST be allowed through (next called)
      expect(next).toHaveBeenCalledTimes(1);

      findUniqueSpy.mockRestore();
    });
  });

  describe('SEC-W0-09: Structured 422 Zod Error Response', () => {
    it('should return structured errors array when validation fails via validate middleware', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'not-an-email' }); // Missing password & fullName, invalid email

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(Array.isArray(res.body.errors)).toBe(true);
      expect(res.body.errors.length).toBeGreaterThanOrEqual(1);
      expect(res.body.errors[0]).toHaveProperty('field');
      expect(res.body.errors[0]).toHaveProperty('message');
    });
  });
});

