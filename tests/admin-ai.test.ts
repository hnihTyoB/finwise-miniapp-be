import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/database/prisma.client';
import { rbacService } from '../src/modules/rbac/rbac.service';
import jwt from 'jsonwebtoken';
import { jwtConfig } from '../src/config/jwt.config';
import { SYSTEM_ROLES } from '../src/common/constants';
import { AiRequestStatus } from '@prisma/client';
import { adminAiRepository } from '../src/modules/ai-assistant/admin-ai.repository';
import { adminAiService } from '../src/modules/ai-assistant/admin-ai.service';

describe('Admin AI Administration & Feature Toggles Integration Tests', () => {
  let adminToken: string;
  let userToken: string;
  let adminUserId: string;
  let normalUserId: string;
  let adminRoleId: string;
  let userRoleId: string;
  let sampleLogId: string;

  beforeAll(async () => {
    const adminRole = await prisma.role.findUnique({ where: { name: SYSTEM_ROLES.ADMIN } });
    const userRole = await prisma.role.findUnique({ where: { name: SYSTEM_ROLES.USER } });

    adminRoleId = adminRole!.id;
    userRoleId = userRole!.id;

    // Admin user
    let admin = await prisma.user.findFirst({
      where: { email: 'admin@finwise.local' },
    });
    if (!admin) {
      admin = await prisma.user.create({
        data: {
          email: 'admin@finwise.local',
          password: 'dummy',
          roleId: adminRoleId,
          isActive: true,
        },
      });
    }
    adminUserId = admin.id;

    // Normal user
    const testUserEmail = `test_ai_admin_${Date.now()}@finwise.local`;
    const normalUser = await prisma.user.create({
      data: {
        email: testUserEmail,
        password: 'dummy',
        fullName: 'Test AI User',
        roleId: userRoleId,
        isActive: true,
      },
    });
    normalUserId = normalUser.id;

    // Ensure ADMIN has all permissions
    const allPerms = await prisma.permission.findMany({ select: { id: true } });
    if (allPerms.length > 0) {
      await prisma.rolePermission.createMany({
        data: allPerms.map((p) => ({ roleId: adminRoleId, permissionId: p.id })),
        skipDuplicates: true,
      });
    }

    await rbacService.invalidateRoleCache(adminRoleId);
    await rbacService.invalidateUserCache(adminUserId);
    await rbacService.invalidateRoleCache(userRoleId);
    await rbacService.invalidateUserCache(normalUserId);

    adminToken = jwt.sign(
      { id: adminUserId, email: admin.email, role: 'ADMIN', roleId: adminRoleId },
      jwtConfig.accessSecret,
      { expiresIn: '1h' },
    );

    userToken = jwt.sign(
      { id: normalUserId, email: normalUser.email, role: 'USER', roleId: userRoleId },
      jwtConfig.accessSecret,
      { expiresIn: '1h' },
    );

    // Create sample AI request log records for analytics testing
    const sampleLog = await adminAiRepository.createLog({
      userId: normalUserId,
      feature: 'CHAT',
      provider: 'gemini',
      model: 'gemini-3.5-flash-lite',
      status: AiRequestStatus.SUCCESS,
      promptTokens: 120,
      completionTokens: 80,
      totalTokens: 200,
      latencyMs: 450,
    });
    sampleLogId = sampleLog.id;

    await adminAiRepository.createLog({
      userId: normalUserId,
      feature: 'CATEGORIZE',
      provider: 'gemini',
      model: 'gemini-3.5-flash-lite',
      status: AiRequestStatus.SUCCESS,
      promptTokens: 50,
      completionTokens: 20,
      totalTokens: 70,
      latencyMs: 250,
    });
  });

  afterAll(async () => {
    // Ensure all AI features are re-enabled
    await adminAiService.toggleFeature('assistant', true, adminUserId);
    await adminAiService.toggleFeature('forecasting', true, adminUserId);
    await adminAiService.toggleFeature('anomalies', true, adminUserId);
    await adminAiService.toggleFeature('query', true, adminUserId);

    await prisma.aiRequestLog.deleteMany({ where: { userId: normalUserId } });
    await prisma.user.deleteMany({ where: { id: normalUserId } });
  });

  describe('GET /api/v1/admin/ai/status', () => {
    it('should return 403 for unauthorized users lacking AI_ADMIN_READ', async () => {
      const res = await request(app)
        .get('/api/v1/admin/ai/status')
        .set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(403);
    });

    it('should return operational status of all AI features', async () => {
      const res = await request(app)
        .get('/api/v1/admin/ai/status')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);

      const keys = res.body.data.map((f: any) => f.key);
      expect(keys).toContain('assistant');
      expect(keys).toContain('forecasting');
      expect(keys).toContain('anomalies');
      expect(keys).toContain('query');
    });
  });

  describe('POST /api/v1/admin/ai/features/:feature/toggle & Backend Enforcement', () => {
    it('should disable forecasting feature and block user forecast endpoint with 403', async () => {
      // 1. Toggle forecasting OFF
      const toggleRes = await request(app)
        .post('/api/v1/admin/ai/features/forecasting/toggle')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ enabled: false });

      expect(toggleRes.status).toBe(200);
      expect(toggleRes.body.data.enabled).toBe(false);

      // 2. User attempts to call forecast runway
      const userRes = await request(app)
        .get('/api/v1/forecast/runway')
        .set('Authorization', `Bearer ${userToken}`);

      expect(userRes.status).toBe(403);
      expect(userRes.body.message).toContain('Dự báo dòng tiền đang tạm thời bị vô hiệu hóa');

      // 3. Toggle forecasting back ON
      const restoreRes = await request(app)
        .post('/api/v1/admin/ai/features/forecasting/toggle')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ enabled: true });

      expect(restoreRes.status).toBe(200);
      expect(restoreRes.body.data.enabled).toBe(true);
    });

    it('should disable query engine feature and block query parse endpoint with 403', async () => {
      // 1. Toggle query OFF
      await request(app)
        .post('/api/v1/admin/ai/features/query/toggle')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ enabled: false });

      // 2. User attempts to parse query
      const userRes = await request(app)
        .post('/api/v1/query/parse')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ query: 'Hôm nay chi bao nhiêu tiền' });

      expect(userRes.status).toBe(403);

      // 3. Toggle query back ON
      await request(app)
        .post('/api/v1/admin/ai/features/query/toggle')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ enabled: true });
    });
  });

  describe('GET /api/v1/admin/ai/usage', () => {
    it('should return aggregate token usage and latency metrics', async () => {
      const res = await request(app)
        .get('/api/v1/admin/ai/usage?period=today')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalRequests).toBeGreaterThanOrEqual(2);
      expect(res.body.data.totalTokens).toBeGreaterThanOrEqual(270);
      expect(res.body.data.successRate).toBeGreaterThan(0);
      expect(Array.isArray(res.body.data.byFeature)).toBe(true);
    });
  });

  describe('GET /api/v1/admin/ai/logs', () => {
    it('should return paginated AI request logs', async () => {
      const res = await request(app)
        .get('/api/v1/admin/ai/logs?feature=CHAT')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      const found = res.body.data.find((l: any) => l.id === sampleLogId);
      expect(found).toBeDefined();
      expect(found.feature).toBe('CHAT');
      expect(found.totalTokens).toBe(200);
    });
  });

  describe('AI Rate Limit Configuration', () => {
    it('should read and update AI rate limit configuration dynamically', async () => {
      const getRes = await request(app)
        .get('/api/v1/admin/ai/rate-limit')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data).toHaveProperty('maxRequests');
      expect(getRes.body.data).toHaveProperty('windowMs');

      const putRes = await request(app)
        .put('/api/v1/admin/ai/rate-limit')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          maxRequests: 35,
          windowMs: 600000,
        });

      expect(putRes.status).toBe(200);
      expect(putRes.body.data.maxRequests).toBe(35);
      expect(putRes.body.data.windowMs).toBe(600000);

      // Verify audit log
      const audit = await prisma.auditLog.findFirst({
        where: { targetType: 'AI_RATE_LIMIT', action: 'AI_CONFIG_UPDATE' },
        orderBy: { createdAt: 'desc' },
      });
      expect(audit).not.toBeNull();

      // Restore rate limit
      await request(app)
        .put('/api/v1/admin/ai/rate-limit')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          maxRequests: 20,
          windowMs: 900000,
        });
    });
  });
});
