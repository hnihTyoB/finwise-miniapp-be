import crypto from 'crypto';
import { AuthService } from '../src/modules/auth/auth.service';
import { AuthRepository } from '../src/modules/auth/auth.repository';
import { AuthController } from '../src/modules/auth/auth.controller';
import { WebhookService } from '../src/modules/webhooks/webhook.service';
import { ApiKeyService } from '../src/modules/api-keys/api-key.service';
import { createApiKeySchema } from '../src/modules/api-keys/api-key.validation';
import { PERMISSIONS } from '../src/common/constants';
import { zaloBotLinkService } from '../src/modules/zalo-bot/services/zalo-bot-link.service';
import { zaloBotRepository } from '../src/modules/zalo-bot/zalo-bot.repository';
import * as urlHelper from '../src/common/helpers/url.helper';
import { safeFetch } from '../src/common/helpers/url.helper';
import { prisma } from '../src/database/prisma.client';
import { cacheService } from '../src/common/services/cache.service';
import { NotificationChannel } from '@prisma/client';

describe('Wave 1 Security Fixes Verification Tests', () => {
  const authService = new AuthService();
  const authRepository = new AuthRepository();

  describe('SEC-W1-01: Zalo Login Client-Controlled zaloId ATO Prevention', () => {
    it('should reject loginWithZalo when fetchZaloProfile encounters foreign server IP (-501)', async () => {
      // Mock fetchZaloProfile returning -501
      jest.spyOn<any, any>(authService, 'fetchZaloProfile').mockResolvedValue({
        error: -501,
        message: 'Server IP is outside Vietnam',
      });

      await expect(
        authService.loginWithZalo({
          accessToken: 'fake_access_token',
          zaloId: 'victim_zalo_123',
        }),
      ).rejects.toThrow('Zalo API authentication unavailable from foreign server IP');
    });

    it('should reject loginWithZalo when fetchZaloProfile throws network error instead of falling back to client zaloId', async () => {
      jest.spyOn<any, any>(authService, 'fetchZaloProfile').mockRejectedValue(new Error('Network timeout'));

      await expect(
        authService.loginWithZalo({
          accessToken: 'fake_access_token',
          zaloId: 'victim_zalo_123',
        }),
      ).rejects.toThrow('Failed to verify Zalo credentials with identity provider');
    });

    it('should reject linkZaloAccount when fetchZaloProfile fails', async () => {
      const validUserId = '01a0b566-b93e-7991-92d9-7103c97522ff';
      // Mock repository on authService
      jest.spyOn((authService as any).repository, 'findById').mockResolvedValue({ id: validUserId, isActive: true } as any);
      jest.spyOn((authService as any).repository, 'findUserSocial').mockResolvedValue(null);
      jest.spyOn<any, any>(authService, 'fetchZaloProfile').mockRejectedValue(new Error('Connection reset'));

      await expect(
        authService.linkZaloAccount(validUserId, {
          accessToken: 'fake_token',
          zaloId: 'victim_zalo_999',
        }),
      ).rejects.toThrow('Failed to verify Zalo account with Zalo server');
    });
  });

  describe('SEC-W1-02: Plaintext Storage of Refresh Tokens in Database', () => {
    const rawToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test_payload.fake_signature';
    const expectedHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    it('should save refresh token in hashed SHA-256 format in database', async () => {
      const createSpy = jest.spyOn(prisma.refreshToken, 'create').mockResolvedValue({
        id: 'token-uuid',
        userId: 'user-1',
        token: expectedHash,
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
        userAgent: null,
        ipAddress: null,
      });

      await authRepository.saveRefreshToken('user-1', rawToken, new Date(Date.now() + 86400000));

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            token: expectedHash,
          }),
        }),
      );

      createSpy.mockRestore();
    });

    it('should query refresh token using hashed format with backward-compatible fallback', async () => {
      const findFirstSpy = jest.spyOn(prisma.refreshToken, 'findFirst').mockResolvedValue({
        id: 'token-uuid',
        userId: 'user-1',
        token: expectedHash,
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
        userAgent: null,
        ipAddress: null,
      });

      const result = await authRepository.findRefreshToken(rawToken);

      expect(findFirstSpy).toHaveBeenCalledWith({
        where: {
          OR: [{ token: expectedHash }, { token: rawToken }],
        },
      });
      expect(result).toBeDefined();

      findFirstSpy.mockRestore();
    });
  });

  describe('SEC-W1-03: Zalo Bot Link Code High Entropy & Brute-Force Rate Limiting', () => {
    it('should generate a 6-character alphanumeric code with high entropy (FW-XXXXXX)', async () => {
      const result = await zaloBotLinkService.generateLinkCode('user-test-entropy');

      expect(result.linkCode).toMatch(/^FW-[2-9A-Z]{6}$/);
      expect(result.expiresInSeconds).toBeGreaterThan(0);
    });

    it('should lock out chatId after 5 consecutive failed verification attempts', async () => {
      const testChatId = `test_attacker_chat_${Date.now()}`;
      await cacheService.del(`zalo:link:attempts:${testChatId}`);

      // 5 failed attempts
      for (let i = 0; i < 5; i++) {
        const attempt = await zaloBotLinkService.verifyAndConsumeLinkCode(`FW-FAIL0${i}`, testChatId);
        expect(attempt.success).toBe(false);
        expect(attempt.reason).toBe('INVALID_OR_EXPIRED_CODE');
      }

      // 6th attempt should be blocked with TOO_MANY_FAILED_ATTEMPTS
      const blockedAttempt = await zaloBotLinkService.verifyAndConsumeLinkCode('FW-VALID', testChatId);
      expect(blockedAttempt.success).toBe(false);
      expect(blockedAttempt.reason).toBe('TOO_MANY_FAILED_ATTEMPTS');

      // Cleanup
      await cacheService.del(`zalo:link:attempts:${testChatId}`);
    });
  });

  describe('SEC-W1-04: Webhook SafeFetch OOM Prevention & Header Stripping on Redirect', () => {
    it('should safely truncate response body exceeding 64KB without OOM', async () => {
      // Mock global fetch returning a large 100KB payload
      const largePayload = 'A'.repeat(100 * 1024);
      const originalFetch = global.fetch;

      global.fetch = jest.fn().mockResolvedValue({
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => largePayload,
      } as any);

      const response = await safeFetch('https://example.com/webhook-receiver', {
        dnsResolver: async () => ['93.184.216.34'], // Public IP
      });

      expect(response.status).toBe(200);
      expect(response.body.length).toBeLessThanOrEqual(64 * 1024);

      global.fetch = originalFetch;
    });

    it('should strip X-FinWise-Signature header when redirecting cross-origin', async () => {
      const originalFetch = global.fetch;

      let callCount = 0;
      global.fetch = jest.fn().mockImplementation(async (url: string, options: any) => {
        callCount++;
        if (callCount === 1) {
          // First response: 302 redirect to another domain
          return {
            status: 302,
            headers: new Headers({ location: 'https://other-domain.com/landing' }),
          } as any;
        }
        // Second response
        return {
          status: 200,
          headers: new Headers(),
          text: async () => 'OK',
        } as any;
      });

      const customHeaders: Record<string, string> = {
        'X-FinWise-Signature': 't=123,v1=secret_hmac',
        'Authorization': 'Bearer test',
      };

      await safeFetch('https://trusted-domain.com/webhook', {
        headers: customHeaders,
        dnsResolver: async () => ['93.184.216.34'], // Public IP
      });

      // Headers should have been stripped for the cross-origin hop
      expect(customHeaders['X-FinWise-Signature']).toBeUndefined();
      expect(customHeaders['Authorization']).toBeUndefined();

      global.fetch = originalFetch;
    });
  });

  describe('SEC-W1-05: Zalo Bot Single Owner per Chat ID', () => {
    it('should unlink previous user when the same chatId is claimed by a new user', async () => {
      // Find 2 existing users in DB to test live transaction (skip gracefully if sandbox is offline)
      let users: { id: string }[];
      try {
        users = await prisma.user.findMany({ take: 2, select: { id: true } });
      } catch (err: any) {
        if (err?.message?.includes('ENOTFOUND') || err?.message?.includes('timeout') || err?.message?.includes('Connection terminated')) {
          console.warn('Skipping live DB test due to offline sandbox environment');
          return;
        }
        throw err;
      }

      if (!users || users.length < 2) return;

      const userAId = users[0].id;
      const userBId = users[1].id;
      const testChatId = `chat_collision_${Date.now()}`;

      // Link User A to testChatId
      await zaloBotRepository.upsertNotificationSettingLink(userAId, testChatId, [NotificationChannel.ZALO]);

      const settingA = await prisma.notificationSetting.findUnique({ where: { userId: userAId } });
      expect(settingA?.zaloBotChatId).toBe(testChatId);

      // Now link User B to the SAME testChatId
      await zaloBotRepository.upsertNotificationSettingLink(userBId, testChatId, [NotificationChannel.ZALO]);

      // User A should now have zaloBotChatId unlinked (null)
      const updatedSettingA = await prisma.notificationSetting.findUnique({ where: { userId: userAId } });
      expect(updatedSettingA?.zaloBotChatId).toBeNull();

      // User B should now be the sole active owner of testChatId
      const settingB = await prisma.notificationSetting.findUnique({ where: { userId: userBId } });
      expect(settingB?.zaloBotChatId).toBe(testChatId);

      // Cleanup
      await zaloBotRepository.clearZaloBotChatId(userBId, [NotificationChannel.IN_APP]);
    });
  });

  describe('SEC-W1-06: Refresh Token Exposure via Query Parameter Prevention', () => {
    const authController = new AuthController();

    it('should ignore req.query.refreshToken in getSessions and not pass query token to service', async () => {
      const getActiveSessionsSpy = jest
        .spyOn((authController as any).service, 'getActiveSessions')
        .mockResolvedValue({ data: [], meta: { total: 0 } });

      const req: any = {
        user: { id: 'test-user-uuid' },
        query: { refreshToken: 'leaked_query_token', page: '1' },
        cookies: {},
        body: {},
        headers: {},
      };
      const res: any = {
        json: jest.fn(),
      };
      const next = jest.fn();

      await authController.getSessions(req, res, next);

      expect(getActiveSessionsSpy).toHaveBeenCalledWith(
        'test-user-uuid',
        undefined, // currentToken must be undefined, NOT 'leaked_query_token'
        expect.anything(),
      );
      expect(res.json).toHaveBeenCalled();
      getActiveSessionsSpy.mockRestore();
    });

    it('should ignore req.query.refreshToken in revokeOtherSessions and reject when no body/cookie/header token present', async () => {
      const revokeSpy = jest
        .spyOn((authController as any).service, 'revokeAllOtherSessions')
        .mockResolvedValue(1);

      const req: any = {
        user: { id: 'test-user-uuid' },
        query: { refreshToken: 'leaked_query_token' },
        cookies: {},
        body: {},
        headers: {},
      };
      const res: any = {
        json: jest.fn(),
      };
      const next = jest.fn();

      await authController.revokeOtherSessions(req, res, next);

      // Should call next with AppError because query param was ignored
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Current session token is required',
          statusCode: 400,
        }),
      );
      expect(revokeSpy).not.toHaveBeenCalled();

      revokeSpy.mockRestore();
    });
  });

  describe('SEC-W1-07: Webhook Endpoint Quota Limit Enforcement', () => {
    const webhookService = new WebhookService();

    it('should reject webhook creation if user has reached the quota limit (10 endpoints)', async () => {
      jest.spyOn((webhookService as any).repository, 'countActiveByUserId').mockResolvedValue(10);

      await expect(
        webhookService.createEndpoint('user-uuid-1', {
          url: 'https://example.com/webhook',
          description: 'Test Webhook',
          events: ['job.completed'],
        }),
      ).rejects.toThrow('Exceeded maximum allowed active webhook endpoints (10)');
    });

    it('should allow webhook creation if active count is below quota (< 10)', async () => {
      jest.spyOn((webhookService as any).repository, 'countActiveByUserId').mockResolvedValue(5);
      jest.spyOn((webhookService as any).repository, 'create').mockResolvedValue({
        id: 'endpoint-1',
        url: 'https://example.com/webhook',
        description: 'Test Webhook',
        secretEncrypted: 'enc_secret',
        events: ['job.completed'],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      // Mock safeFetch / validateUrlAsync to succeed
      jest.spyOn(urlHelper, 'validateUrlAsync').mockResolvedValue(new URL('https://example.com/webhook'));
      const result = await webhookService.createEndpoint('user-uuid-1', {
        url: 'https://example.com/webhook',
        description: 'Test Webhook',
        events: ['job.completed'],
      });

      expect(result.endpoint.id).toBe('endpoint-1');
      expect(result.secret).toBeDefined();
    });
  });

  describe('SEC-W1-08: API Key Quota Limit Enforcement', () => {
    const apiKeyService = new ApiKeyService();

    it('should reject API key creation if user has reached the quota limit (10 keys)', async () => {
      jest.spyOn((apiKeyService as any).repository, 'countActiveByUserId').mockResolvedValue(10);

      await expect(
        apiKeyService.createApiKey('user-uuid-1', {
          name: 'My New Key',
          permissions: [PERMISSIONS.TRANSACTION_READ],
        }),
      ).rejects.toThrow('Exceeded maximum allowed active API keys (10)');
    });

    it('should allow API key creation if active count is below quota (< 10)', async () => {
      jest.spyOn((apiKeyService as any).repository, 'countActiveByUserId').mockResolvedValue(3);
      jest.spyOn((apiKeyService as any).repository, 'create').mockResolvedValue({
        id: 'key-uuid-1',
        name: 'My Valid Key',
        keyPrefix: 'fw_live_abc123',
        keyHash: 'hash',
        permissions: [PERMISSIONS.TRANSACTION_READ],
        ipWhitelist: [],
        status: 'ACTIVE',
        lastUsedAt: null,
        expiresAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const result = await apiKeyService.createApiKey('user-uuid-1', {
        name: 'My Valid Key',
        permissions: [PERMISSIONS.TRANSACTION_READ],
      });

      expect(result.apiKey.id).toBe('key-uuid-1');
      expect(result.rawKey).toBeDefined();
    });
  });

  describe('SEC-W1-09: API Key Validation for Permissions & Expiration Date', () => {
    it('should reject arbitrary permissions not recognized by system', () => {
      const invalidData = {
        name: 'Attacker Key',
        permissions: ['arbitrary:permission', 'admin:superpower'],
      };

      const parsed = createApiKeySchema.safeParse(invalidData);
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.errors[0].message).toBe('Invalid system permission name');
      }
    });

    it('should accept valid system permissions from PERMISSIONS constants', () => {
      const validData = {
        name: 'Valid Service Key',
        permissions: [PERMISSIONS.TRANSACTION_READ, PERMISSIONS.BUDGET_READ],
      };

      const parsed = createApiKeySchema.safeParse(validData);
      expect(parsed.success).toBe(true);
    });

    it('should reject expiresAt in the past', () => {
      const pastDate = new Date(Date.now() - 60000).toISOString();
      const invalidData = {
        name: 'Expired Key',
        expiresAt: pastDate,
      };

      const parsed = createApiKeySchema.safeParse(invalidData);
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.errors[0].message).toBe('Expiration date must be in the future');
      }
    });

    it('should accept expiresAt in the future', () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString();
      const validData = {
        name: 'Future Key',
        expiresAt: futureDate,
      };

      const parsed = createApiKeySchema.safeParse(validData);
      expect(parsed.success).toBe(true);
    });
  });
});
