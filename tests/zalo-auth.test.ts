import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/database/prisma.client';
import { AuthService } from '../src/modules/auth/auth.service';

describe('Zalo Auth Integration Tests', () => {
  const testPhone = '0987654321';
  const testZaloId = 'zalo_test_user_id_99999';
  const testZaloName = 'Nguyễn Văn Zalo';
  const testAvatarUrl = 'https://s120.zadn.vn/avatar_test.jpg';

  afterAll(async () => {
    // Cleanup test user
    const user = await prisma.user.findFirst({
      where: { phoneNumber: testPhone },
    });

    if (user) {
      await prisma.userSocial.deleteMany({ where: { userId: user.id } });
      await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
      await prisma.userDevice.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  describe('Validation', () => {
    it('should reject request when accessToken is missing', async () => {
      const res = await request(app)
        .post('/api/v1/auth/zalo-login')
        .send({ phoneNumber: testPhone });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('should reject request when phoneNumber is missing', async () => {
      const res = await request(app)
        .post('/api/v1/auth/zalo-login')
        .send({ accessToken: 'some_access_token' });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('should reject request when phoneNumber is invalid Vietnamese format', async () => {
      const res = await request(app)
        .post('/api/v1/auth/zalo-login')
        .send({
          accessToken: 'some_access_token',
          phoneNumber: '1234567890', // Invalid prefix
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Invalid Zalo Token', () => {
    it('should return 401 when Zalo access token is invalid', async () => {
      const res = await request(app)
        .post('/api/v1/auth/zalo-login')
        .send({
          accessToken: 'invalid_dummy_token',
          phoneNumber: testPhone,
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('Successful Zalo Login Flow', () => {
    let mockFetchZalo: jest.SpyInstance;

    beforeEach(() => {
      // Mock fetchZaloProfile on AuthService prototype
      mockFetchZalo = jest.spyOn(AuthService.prototype as any, 'fetchZaloProfile').mockResolvedValue({
        id: testZaloId,
        name: testZaloName,
        error: 0,
        message: 'Success',
        picture: {
          data: {
            url: testAvatarUrl,
          },
        },
      });
    });

    afterEach(() => {
      mockFetchZalo.mockRestore();
    });

    it('should create new user and return tokens when phone does not exist yet', async () => {
      const res = await request(app)
        .post('/api/v1/auth/zalo-login')
        .send({
          accessToken: 'valid_mock_token_123',
          phoneNumber: testPhone,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('refreshToken');
      expect(res.body.data.user).toHaveProperty('phoneNumber', testPhone);
      expect(res.body.data.user).toHaveProperty('fullName', testZaloName);
      expect(res.body.data.user).toHaveProperty('avatarUrl', testAvatarUrl);
      expect(res.body.data.user).toHaveProperty('isActive', true);

      // Verify cookies are set
      const cookies = res.headers['set-cookie'] as unknown as string[];
      expect(cookies).toBeDefined();
      expect(cookies.some((c: string) => c.includes('accessToken'))).toBe(true);
      expect(cookies.some((c: string) => c.includes('refreshToken'))).toBe(true);

      // Verify DB record
      const dbUser = await prisma.user.findFirst({
        where: { phoneNumber: testPhone },
        include: { socialAccounts: true },
      });
      expect(dbUser).not.toBeNull();
      expect(dbUser?.socialAccounts.length).toBe(1);
      expect(dbUser?.socialAccounts[0].provider).toBe('zalo');
      expect(dbUser?.socialAccounts[0].providerUserId).toBe(testZaloId);
    });

    it('should login existing user and return tokens without duplicate creation', async () => {
      const res = await request(app)
        .post('/api/v1/auth/zalo-login')
        .send({
          accessToken: 'valid_mock_token_123',
          phoneNumber: testPhone,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.phoneNumber).toBe(testPhone);

      // Ensure no duplicate users were created
      const count = await prisma.user.count({
        where: { phoneNumber: testPhone },
      });
      expect(count).toBe(1);
    });
  });
});
