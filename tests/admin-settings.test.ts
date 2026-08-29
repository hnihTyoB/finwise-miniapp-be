import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/database/prisma.client';
import { rbacService } from '../src/modules/rbac/rbac.service';
import jwt from 'jsonwebtoken';
import { jwtConfig } from '../src/config/jwt.config';
import { SYSTEM_ROLES } from '../src/common/constants';
import { systemSettingService } from '../src/modules/system-settings/system-setting.service';

describe('Admin System Settings & Maintenance Integration Tests', () => {
  let adminToken: string;
  let userToken: string;
  let adminUserId: string;
  let normalUserId: string;
  let adminRoleId: string;
  let userRoleId: string;

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
    const testUserEmail = `test_settings_user_${Date.now()}@finwise.local`;
    const normalUser = await prisma.user.create({
      data: {
        email: testUserEmail,
        password: 'dummy',
        roleId: userRoleId,
        isActive: true,
      },
    });
    normalUserId = normalUser.id;

    // Grant all permissions to ADMIN role
    const allSystemPerms = await prisma.permission.findMany({ select: { id: true } });
    if (allSystemPerms.length > 0) {
      await prisma.rolePermission.createMany({
        data: allSystemPerms.map((perm) => ({
          roleId: adminRoleId,
          permissionId: perm.id,
        })),
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
  });

  afterAll(async () => {
    // Reset maintenance mode to false to keep environment clean
    await systemSettingService.updateMaintenanceMode({ enabled: false }, adminUserId);
    await prisma.user.deleteMany({ where: { id: normalUserId } });
  });

  describe('GET /api/v1/system/public-config', () => {
    it('should return public system configuration without authentication', async () => {
      const res = await request(app).get('/api/v1/system/public-config');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('maintenance');
      expect(res.body.data).toHaveProperty('features');
      expect(res.body.data).toHaveProperty('general');
    });
  });

  describe('GET /api/v1/admin/settings', () => {
    it('should return 401 when no token is provided', async () => {
      const res = await request(app).get('/api/v1/admin/settings');
      expect(res.status).toBe(401);
    });

    it('should return 403 when accessed by normal user lacking SYSTEM_CONFIG_READ', async () => {
      const res = await request(app)
        .get('/api/v1/admin/settings')
        .set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(403);
    });

    it('should return list of settings when accessed by admin', async () => {
      const res = await request(app)
        .get('/api/v1/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('should filter settings by category', async () => {
      const res = await request(app)
        .get('/api/v1/admin/settings?category=NOTIFICATION')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.every((s: any) => s.category === 'NOTIFICATION')).toBe(true);
    });
  });

  describe('GET /api/v1/admin/settings/:key', () => {
    it('should return specific setting detail', async () => {
      const res = await request(app)
        .get('/api/v1/admin/settings/general.default_timezone')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.key).toBe('general.default_timezone');
      expect(res.body.data.value).toBe('Asia/Ho_Chi_Minh');
    });

    it('should return 404 for unknown setting key', async () => {
      const res = await request(app)
        .get('/api/v1/admin/settings/unknown.invalid_setting_key')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/v1/admin/settings/:key', () => {
    it('should update boolean setting, invalidate cache, and create audit log', async () => {
      const res = await request(app)
        .patch('/api/v1/admin/settings/notifications.push_enabled')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ value: true });

      expect(res.status).toBe(200);
      expect(res.body.data.value).toBe('true');

      // Verify cached getter returns updated value
      const val = await systemSettingService.getBoolean('notifications.push_enabled');
      expect(val).toBe(true);

      // Verify audit log was created
      const audit = await prisma.auditLog.findFirst({
        where: { targetId: 'notifications.push_enabled', action: 'SYSTEM_CONFIG_UPDATE' },
        orderBy: { createdAt: 'desc' },
      });
      expect(audit).not.toBeNull();
      expect(audit?.actorId).toBe(adminUserId);

      // Revert setting
      await request(app)
        .patch('/api/v1/admin/settings/notifications.push_enabled')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ value: false });
    });

    it('should reject invalid type value for number setting', async () => {
      const res = await request(app)
        .patch('/api/v1/admin/settings/ai.rate_limit.max_requests')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ value: 'not-a-number' });

      expect(res.status).toBe(400);
    });
  });

  describe('Maintenance Mode & Middleware Protection', () => {
    it('should enable maintenance mode via admin endpoint and create audit log', async () => {
      const res = await request(app)
        .post('/api/v1/admin/settings/maintenance')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          enabled: true,
          message: 'Bảo trì máy chủ để nâng cấp hệ thống định kỳ',
          startAt: new Date().toISOString(),
        });

      expect(res.status).toBe(200);
      expect(res.body.data.enabled).toBe(true);

      // Public config reflects maintenance
      const pubRes = await request(app).get('/api/v1/system/public-config');
      expect(pubRes.body.data.maintenance.enabled).toBe(true);
    });

    it('should block regular user business endpoints with 503 during maintenance', async () => {
      const res = await request(app)
        .get('/api/v1/wallets')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(503);
      expect(res.body.code).toBe('MAINTENANCE_MODE_ACTIVE');
      expect(res.body.message).toContain('Bảo trì');
    });

    it('should allow admin users to access Admin Control Center endpoints during maintenance', async () => {
      const res = await request(app)
        .get('/api/v1/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });

    it('should allow whitelisted health and auth endpoints during maintenance', async () => {
      const healthRes = await request(app).get('/api/v1/health');
      expect(healthRes.status).toBe(200);

      const meRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${userToken}`);
      expect(meRes.status).toBe(200);
    });

    it('should disable maintenance mode and restore regular user access', async () => {
      const res = await request(app)
        .post('/api/v1/admin/settings/maintenance')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ enabled: false });

      expect(res.status).toBe(200);
      expect(res.body.data.enabled).toBe(false);

      // Regular user can access business endpoints again
      const walletRes = await request(app)
        .get('/api/v1/wallets')
        .set('Authorization', `Bearer ${userToken}`);
      expect(walletRes.status).toBe(200);
    });
  });
});
