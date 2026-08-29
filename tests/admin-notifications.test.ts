import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/database/prisma.client';
import { rbacService } from '../src/modules/rbac/rbac.service';
import jwt from 'jsonwebtoken';
import { jwtConfig } from '../src/config/jwt.config';
import { SYSTEM_ROLES } from '../src/common/constants';
import {
  NotificationChannel,
  NotificationDeliveryStatus,
  NotificationPriority,
  NotificationType,
} from '@prisma/client';

describe('Admin Notification Management Integration Tests', () => {
  let adminToken: string;
  let userToken: string;
  let adminUserId: string;
  let normalUserId: string;
  let adminRoleId: string;
  let userRoleId: string;
  let testNotificationId: string;
  let testDeliveryId: string;

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
    const testUserEmail = `test_notif_admin_${Date.now()}@finwise.local`;
    const normalUser = await prisma.user.create({
      data: {
        email: testUserEmail,
        password: 'dummy',
        fullName: 'Test Notification User',
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

    // Create a dummy notification with a failed delivery for testing
    const testNotif = await prisma.notification.create({
      data: {
        userId: normalUserId,
        type: NotificationType.BUDGET_NEAR_LIMIT,
        priority: NotificationPriority.HIGH,
        title: 'Cảnh báo ngân sách sắp vượt hạn mức',
        message: 'Bạn đã sử dụng 85% ngân sách Ăn uống tháng này.',
        channels: [NotificationChannel.EMAIL],
        dedupKey: `test_dedup_${Date.now()}`,
        deliveries: {
          create: [
            {
              channel: NotificationChannel.EMAIL,
              status: NotificationDeliveryStatus.FAILED,
              attemptCount: 3,
              failureReason: 'SMTP connection timed out',
            },
          ],
        },
      },
      include: { deliveries: true },
    });

    testNotificationId = testNotif.id;
    testDeliveryId = testNotif.deliveries[0].id;
  });

  afterAll(async () => {
    await prisma.notificationDelivery.deleteMany({
      where: { notification: { userId: normalUserId } },
    });
    await prisma.notification.deleteMany({
      where: { userId: normalUserId },
    });
    await prisma.user.deleteMany({
      where: { id: normalUserId },
    });
  });

  describe('GET /api/v1/admin/notifications/overview', () => {
    it('should return 403 for unauthorized users without NOTIFICATION_ADMIN_READ', async () => {
      const res = await request(app)
        .get('/api/v1/admin/notifications/overview')
        .set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(403);
    });

    it('should return aggregate notification statistics for admin', async () => {
      const res = await request(app)
        .get('/api/v1/admin/notifications/overview')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('totalNotifications');
      expect(res.body.data).toHaveProperty('totalSent');
      expect(res.body.data).toHaveProperty('totalFailed');
      expect(res.body.data).toHaveProperty('deliverySuccessRate');
      expect(Array.isArray(res.body.data.channelBreakdown)).toBe(true);
      expect(Array.isArray(res.body.data.typeBreakdown)).toBe(true);
    });
  });

  describe('GET /api/v1/admin/notifications/deliveries', () => {
    it('should return paginated deliveries list with user & notification details', async () => {
      const res = await request(app)
        .get('/api/v1/admin/notifications/deliveries')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body).toHaveProperty('meta');

      const found = res.body.data.find((d: any) => d.id === testDeliveryId);
      expect(found).toBeDefined();
      expect(found.notification.title).toBe('Cảnh báo ngân sách sắp vượt hạn mức');
      expect(found.user.fullName).toBe('Test Notification User');
    });

    it('should filter deliveries by status FAILED', async () => {
      const res = await request(app)
        .get('/api/v1/admin/notifications/deliveries?status=FAILED')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.every((d: any) => d.status === 'FAILED')).toBe(true);
    });
  });

  describe('POST /api/v1/admin/notifications/deliveries/:id/retry', () => {
    it('should retry a failed delivery and emit an audit log', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/notifications/deliveries/${testDeliveryId}/retry`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe(NotificationDeliveryStatus.PENDING);
      expect(res.body.data.failureReason).toBeNull();

      // Check audit log
      const audit = await prisma.auditLog.findFirst({
        where: { targetId: testDeliveryId, action: 'NOTIFICATION_RETRY' },
        orderBy: { createdAt: 'desc' },
      });
      expect(audit).not.toBeNull();
      expect(audit?.actorId).toBe(adminUserId);
    });

    it('should return 404 for invalid delivery id', async () => {
      const res = await request(app)
        .post('/api/v1/admin/notifications/deliveries/00000000-0000-0000-0000-000000000000/retry')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('Notification Templates Management', () => {
    let templateId: string;

    it('should list notification templates', async () => {
      const res = await request(app)
        .get('/api/v1/admin/notifications/templates')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      templateId = res.body.data[0].id;
    });

    it('should update template and emit an audit log', async () => {
      const res = await request(app)
        .put(`/api/v1/admin/notifications/templates/${templateId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          titleTemplate: 'Tiêu đề cập nhật: {{budgetName}}',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.titleTemplate).toBe('Tiêu đề cập nhật: {{budgetName}}');

      const audit = await prisma.auditLog.findFirst({
        where: { targetId: templateId, action: 'NOTIFICATION_TEMPLATE_UPDATE' },
        orderBy: { createdAt: 'desc' },
      });
      expect(audit).not.toBeNull();
    });
  });

  describe('Notification Channels Configuration', () => {
    it('should retrieve channel configuration', async () => {
      const res = await request(app)
        .get('/api/v1/admin/notifications/channels')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('inAppEnabled');
      expect(res.body.data).toHaveProperty('emailEnabled');
    });

    it('should update channel configuration and emit an audit log', async () => {
      const res = await request(app)
        .put('/api/v1/admin/notifications/channels')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          pushEnabled: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.pushEnabled).toBe(true);

      const audit = await prisma.auditLog.findFirst({
        where: { targetType: 'NOTIFICATION_CONFIG', action: 'NOTIFICATION_CONFIG_UPDATE' },
        orderBy: { createdAt: 'desc' },
      });
      expect(audit).not.toBeNull();

      // Revert pushEnabled
      await request(app)
        .put('/api/v1/admin/notifications/channels')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ pushEnabled: false });
    });
  });
});
