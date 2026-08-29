import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/database/prisma.client';

describe('Auth Integration Tests', () => {
  const testUser = {
    email: 'register-test@gmail.com',
    password: 'Password@123456',
    fullName: 'Test Register User',
  };

  afterAll(async () => {
    // Dọn dẹp dữ liệu kiểm thử
    await prisma.verificationToken.deleteMany({
      where: {
        user: {
          email: testUser.email,
        },
      },
    });

    await prisma.refreshToken.deleteMany({
      where: {
        user: {
          email: testUser.email,
        },
      },
    });

    await prisma.userDevice.deleteMany({
      where: {
        user: {
          email: testUser.email,
        },
      },
    });

    await prisma.user.deleteMany({
      where: {
        email: testUser.email,
      },
    });
  });

  let verificationToken = '';
  let accessTokenCookie = '';
  let accessTokenHeader = '';

  it('should register a new user successfully', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send(testUser);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('message');

    // Lấy token từ database để verify
    const dbUser = await prisma.user.findUnique({
      where: { email: testUser.email },
      include: { verificationTokens: true },
    });

    expect(dbUser).toBeDefined();
    expect(dbUser?.isActive).toBe(false);
    expect(dbUser?.verificationTokens.length).toBe(1);
    verificationToken = dbUser?.verificationTokens[0].token || '';
  });

  it('should not allow login with inactive account', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password,
      });

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('success', false);
    expect(res.body.code).toBe('USER_INACTIVE');
  });

  it('should verify email successfully', async () => {
    const res = await request(app)
      .get(`/api/v1/auth/verify-email?token=${verificationToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('message');

    const dbUser = await prisma.user.findUnique({
      where: { email: testUser.email },
    });
    expect(dbUser?.isActive).toBe(true);
  });

  it('should login successfully and set cookies', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password,
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body.data).toHaveProperty('user');
    expect(res.body.data.user).toHaveProperty('email', testUser.email);
    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data).toHaveProperty('refreshToken');

    // Lấy cookie
    const cookies = (res.headers['set-cookie'] || []) as string[];
    expect(cookies).toBeDefined();
    
    const accessTokenMatch = cookies.find(c => c.startsWith('accessToken='));
    expect(accessTokenMatch).toBeDefined();
    
    // Trích xuất JWT token phục vụ test gọi API bằng header
    const token = accessTokenMatch?.split(';')[0].split('=')[1];
    expect(token).toBeDefined();
    accessTokenHeader = token || '';
    
    // Giữ nguyên mảng cookie để gọi API qua cookie
    accessTokenCookie = cookies.join('; ');
  });

  it('should get current user profile using Bearer token header', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessTokenHeader}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body.data).toHaveProperty('email', testUser.email);
  });

  it('should get current user profile using Cookie', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', accessTokenCookie);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body.data).toHaveProperty('email', testUser.email);
  });

  it('should update user profile successfully', async () => {
    const res = await request(app)
      .put('/api/v1/auth/profile')
      .set('Authorization', `Bearer ${accessTokenHeader}`)
      .send({
        fullName: 'Updated Test User',
        phoneNumber: '0987654321',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.fullName).toBe('Updated Test User');
    expect(res.body.data.phoneNumber).toBe('0987654321');
  });

  it('should handle unchanged profile update gracefully', async () => {
    const res = await request(app)
      .put('/api/v1/auth/profile')
      .set('Authorization', `Bearer ${accessTokenHeader}`)
      .send({
        fullName: 'Updated Test User',
        phoneNumber: '0987654321',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.fullName).toBe('Updated Test User');
    expect(res.body.data.phoneNumber).toBe('0987654321');
  });

  it('should update user avatar successfully', async () => {
    const res = await request(app)
      .put('/api/v1/auth/avatar')
      .set('Authorization', `Bearer ${accessTokenHeader}`)
      .send({
        avatarUrl: 'https://example.com/avatar.png',
        avatarPositionX: 60,
        avatarPositionY: 40,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.avatarUrl).toBe('https://example.com/avatar.png');
    expect(res.body.data.avatarPositionX).toBe(60);
    expect(res.body.data.avatarPositionY).toBe(40);
  });

  it('should handle unchanged avatar update gracefully', async () => {
    const res = await request(app)
      .put('/api/v1/auth/avatar')
      .set('Authorization', `Bearer ${accessTokenHeader}`)
      .send({
        avatarUrl: 'https://example.com/avatar.png',
        avatarPositionX: 60,
        avatarPositionY: 40,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.avatarUrl).toBe('https://example.com/avatar.png');
  });

  it('should delete user avatar successfully', async () => {
    const res = await request(app)
      .delete('/api/v1/auth/avatar')
      .set('Authorization', `Bearer ${accessTokenHeader}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.avatarUrl).toBeNull();
    expect(res.body.data.avatarPositionX).toBe(50);
    expect(res.body.data.avatarPositionY).toBe(50);
  });

  it('should get active sessions with pagination and meta', async () => {
    const res = await request(app)
      .get('/api/v1/auth/sessions?page=1&limit=5')
      .set('Authorization', `Bearer ${accessTokenHeader}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toBeDefined();
    expect(res.body.meta.page).toBe(1);
    expect(res.body.meta.limit).toBe(5);
    expect(typeof res.body.meta.total).toBe('number');
    expect(typeof res.body.meta.totalPages).toBe('number');
  });

  it('should return 422 for invalid pagination query parameters', async () => {
    const res = await request(app)
      .get('/api/v1/auth/sessions?page=-1&limit=200')
      .set('Authorization', `Bearer ${accessTokenHeader}`);

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('should logout successfully and clear cookies', async () => {
    // Trích xuất refresh token từ DB để gửi kèm body nếu logout yêu cầu (hoặc qua cookie)
    const dbUser = await prisma.user.findUnique({
      where: { email: testUser.email },
      include: { refreshTokens: true },
    });
    const refreshToken = dbUser?.refreshTokens[0]?.token || '';

    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', accessTokenCookie)
      .send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('message');

    // Kiểm tra xem refresh token trong DB đã bị xoá chưa
    const tokensCount = await prisma.refreshToken.count({
      where: {
        userId: dbUser?.id,
      },
    });
    expect(tokensCount).toBe(0);
  });

  it('should return 422 for invalid session UUID parameter', async () => {
    const res = await request(app)
      .delete('/api/v1/auth/sessions/invalid-session-uuid')
      .set('Authorization', `Bearer ${accessTokenHeader}`);

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});
