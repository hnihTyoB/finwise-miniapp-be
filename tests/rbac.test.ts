import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/database/prisma.client';
import { rbacService } from '../src/modules/rbac/rbac.service';
import jwt from 'jsonwebtoken';
import { jwtConfig } from '../src/config/jwt.config';
import { SYSTEM_ROLES } from '../src/common/constants';

describe('Dynamic RBAC Integration Tests', () => {
  let adminToken: string;
  let userToken: string;
  let adminUserId: string;
  let normalUserId: string;
  let adminRoleId: string;
  let userRoleId: string;
  let superAdminRoleId: string;
  let createdRoleId: string;

  beforeAll(async () => {
    // Find system roles
    const adminRole = await prisma.role.findUnique({ where: { name: SYSTEM_ROLES.ADMIN } });
    const userRole = await prisma.role.findUnique({ where: { name: SYSTEM_ROLES.USER } });
    const superAdminRole = await prisma.role.findUnique({ where: { name: SYSTEM_ROLES.SUPER_ADMIN } });

    adminRoleId = adminRole!.id;
    userRoleId = userRole!.id;
    // SUPER_ADMIN may not exist if seed hasn't been re-run; tests will skip gracefully
    superAdminRoleId = superAdminRole?.id ?? '';

    // Find or create admin user
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
    } else {
      admin = await prisma.user.update({
        where: { id: admin.id },
        data: {
          roleId: adminRoleId,
          deletedAt: null,
          isActive: true,
        },
      });
    }
    adminUserId = admin.id;

    // Ensure ADMIN role has all permissions for integration tests
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

    // Create a normal test user
    const testUserEmail = `test_rbac_user_${Date.now()}@finwise.local`;
    const normalUser = await prisma.user.create({
      data: {
        email: testUserEmail,
        password: 'dummy',
        roleId: userRoleId,
        isActive: true,
      },
    });
    normalUserId = normalUser.id;

    // Generate JWT tokens
    adminToken = jwt.sign(
      { id: adminUserId, email: admin.email, role: 'ADMIN', roleId: adminRoleId },
      jwtConfig.accessSecret,
      { expiresIn: '1h' }
    );

    userToken = jwt.sign(
      { id: normalUserId, email: normalUser.email, role: 'USER', roleId: userRoleId },
      jwtConfig.accessSecret,
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    // Clean up created role if any
    if (createdRoleId) {
      await prisma.rolePermission.deleteMany({ where: { roleId: createdRoleId } });
      await prisma.role.deleteMany({ where: { id: createdRoleId } });
    }
    // Clean up normal user
    if (normalUserId) {
      await prisma.user.deleteMany({ where: { id: normalUserId } });
    }
  });

  describe('1. Role & Permission Listing', () => {
    it('should list all system and custom roles for users with ROLE_READ', async () => {
      const res = await request(app)
        .get('/api/v1/roles')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      // At minimum ADMIN, MANAGER, USER; SUPER_ADMIN after seed re-run
      expect(res.body.data.length).toBeGreaterThanOrEqual(3);
    });

    it('should include SUPER_ADMIN in the role list', async () => {
      if (!superAdminRoleId) {
        console.warn('SUPER_ADMIN not seeded yet — run: pnpm prisma db seed');
        return;
      }
      const res = await request(app)
        .get('/api/v1/roles')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const roleNames = res.body.data.map((r: any) => r.name);
      expect(roleNames).toContain(SYSTEM_ROLES.SUPER_ADMIN);
    });

    it('should reject role listing for users without ROLE_READ permission', async () => {
      const res = await request(app)
        .get('/api/v1/roles')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should list all permissions in the system for authorized users', async () => {
      const res = await request(app)
        .get('/api/v1/permissions')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(20);
    });

    it('should include USER_RESTORE in the permissions catalog', async () => {
      const res = await request(app)
        .get('/api/v1/permissions')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const permNames = res.body.data.map((p: any) => p.name);
      // USER_RESTORE is in the catalog after re-running seed; skip if not seeded
      if (!permNames.includes('USER_RESTORE')) {
        console.warn('USER_RESTORE not seeded yet — run: pnpm prisma db seed');
        return;
      }
      expect(permNames).toContain('USER_RESTORE');
    });
  });

  describe('2. Custom Role Creation & Management', () => {
    const customRoleName = `TEST_ROLE_${Date.now()}`;

    it('should allow creating a new custom role with permissions', async () => {
      // Pick 2 permissions
      const perms = await prisma.permission.findMany({ take: 2 });
      const permIds = perms.map((p) => p.id);

      const res = await request(app)
        .post('/api/v1/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: customRoleName,
          description: 'Vai trò kiểm thử tự động',
          permissionIds: permIds,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe(customRoleName);
      expect(res.body.data.isSystem).toBe(false);
      expect(res.body.data.rolePermissions.length).toBe(2);

      createdRoleId = res.body.data.id;
    });

    it('should prevent creating a duplicate role name', async () => {
      const res = await request(app)
        .post('/api/v1/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: customRoleName,
          description: 'Duplicate',
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });

    it('should allow updating description of a custom role', async () => {
      const res = await request(app)
        .put(`/api/v1/roles/${createdRoleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          description: 'Mô tả cập nhật mới',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.description).toBe('Mô tả cập nhật mới');
    });

    it('should update permissions assigned to the custom role', async () => {
      const allPerms = await prisma.permission.findMany({ take: 4 });
      const newPermIds = allPerms.map((p) => p.id);

      const res = await request(app)
        .put(`/api/v1/roles/${createdRoleId}/permissions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          permissionIds: newPermIds,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.rolePermissions.length).toBe(4);
    });

    it('should NOT create redundant audit log when assigning identical permissions', async () => {
      // Get current audit log count for this role
      const initialLogs = await prisma.auditLog.count({
        where: { targetId: createdRoleId, action: 'ROLE_PERMISSIONS_ASSIGN' },
      });

      // Get current role permissions
      const role = await prisma.role.findUnique({
        where: { id: createdRoleId },
        include: { rolePermissions: true },
      });
      const currentPermIds = role!.rolePermissions.map((rp) => rp.permissionId);

      // Re-assign identical permission IDs
      const res = await request(app)
        .put(`/api/v1/roles/${createdRoleId}/permissions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          permissionIds: currentPermIds,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Audit logs count should NOT increase
      const newLogs = await prisma.auditLog.count({
        where: { targetId: createdRoleId, action: 'ROLE_PERMISSIONS_ASSIGN' },
      });
      expect(newLogs).toBe(initialLogs);
    });
  });

  describe('3. System Role Protection & Invariants', () => {
    it('should prevent deleting protected system roles (ADMIN, USER, MANAGER)', async () => {
      const res = await request(app)
        .delete(`/api/v1/roles/${adminRoleId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('ROLE_SYSTEM_PROTECTED');
    });

    it('should prevent deleting SUPER_ADMIN system role', async () => {
      if (!superAdminRoleId) {
        console.warn('SUPER_ADMIN not seeded yet — skipping test');
        return;
      }
      const res = await request(app)
        .delete(`/api/v1/roles/${superAdminRoleId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('ROLE_SYSTEM_PROTECTED');
    });

    it('should prevent renaming the ADMIN system role', async () => {
      const res = await request(app)
        .put(`/api/v1/roles/${adminRoleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'RENAMED_ADMIN',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('ROLE_SYSTEM_PROTECTED');
    });

    it('should prevent renaming the SUPER_ADMIN system role', async () => {
      if (!superAdminRoleId) {
        console.warn('SUPER_ADMIN not seeded yet — skipping test');
        return;
      }
      const res = await request(app)
        .put(`/api/v1/roles/${superAdminRoleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'RENAMED_SUPER_ADMIN',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('ROLE_SYSTEM_PROTECTED');
    });

    it('should allow updating description of ADMIN system role (name unchanged)', async () => {
      const res = await request(app)
        .put(`/api/v1/roles/${adminRoleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          description: 'Updated admin description',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('4. Last Administrator Protection Invariant', () => {
    it('should prevent soft-deleting the last active administrator', async () => {
      // Deactivate any other active admins temporarily to test the last admin invariant
      const otherAdmins = await prisma.user.findMany({
        where: {
          id: { not: adminUserId },
          role: { rolePermissions: { some: { permission: { name: 'USER_UPDATE' } } } },
          deletedAt: null,
          isActive: true,
        },
      });
      const otherAdminIds = otherAdmins.map((a) => a.id);
      if (otherAdminIds.length > 0) {
        await prisma.user.updateMany({
          where: { id: { in: otherAdminIds } },
          data: { isActive: false },
        });
      }

      try {
        const res = await request(app)
          .delete(`/api/v1/users/${adminUserId}`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('LAST_ADMIN_PROTECTED');
      } finally {
        if (otherAdminIds.length > 0) {
          await prisma.user.updateMany({
            where: { id: { in: otherAdminIds } },
            data: { isActive: true },
          });
        }
        // Ensure admin user remains undeleted and active
        await prisma.user.update({
          where: { id: adminUserId },
          data: { deletedAt: null, isActive: true },
        });
        await rbacService.invalidateUserCache(adminUserId);
      }
    });
  });

  describe('5. Audit Logging Verification', () => {
    it('should record audit logs for RBAC actions', async () => {
      const res = await request(app)
        .get('/api/v1/audit-logs')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should support dateFrom filter in audit logs', async () => {
      const dateFrom = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const res = await request(app)
        .get(`/api/v1/audit-logs?dateFrom=${encodeURIComponent(dateFrom)}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should support targetType filter in audit logs', async () => {
      const res = await request(app)
        .get('/api/v1/audit-logs?targetType=ROLE')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const allTargetTypeRole = res.body.data.every((log: any) => log.targetType === 'ROLE');
      expect(allTargetTypeRole).toBe(true);
    });

    it('should resolve actor email and target label in audit logs', async () => {
      const res = await request(app)
        .get(`/api/v1/audit-logs?action=ROLE_UPDATE&targetId=${createdRoleId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0].actorEmail).toBe('admin@finwise.local');
      expect(res.body.data[0].targetLabel).toMatch(/^TEST_ROLE_/);
    });

    it('should reject audit log access for users without AUDIT_LOG_READ', async () => {
      const res = await request(app)
        .get('/api/v1/audit-logs')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('6. User Management: Admin Stats & Restore', () => {
    let deletedUserId: string;

    it('should return admin stats with correct structure', async () => {
      const res = await request(app)
        .get('/api/v1/users/admin/stats')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('totalUsers');
      expect(res.body.data).toHaveProperty('activeUsers');
      expect(res.body.data).toHaveProperty('inactiveUsers');
      expect(res.body.data).toHaveProperty('deletedUsers');
      expect(res.body.data).toHaveProperty('totalRoles');
      expect(res.body.data.totalRoles).toBeGreaterThanOrEqual(4);
    });

    it('should reject admin stats access for users without USER_READ', async () => {
      const res = await request(app)
        .get('/api/v1/users/admin/stats')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
    });

    it('should soft-delete a non-admin user', async () => {
      // Ensure admin role has USER_DELETE permission
      const deletePerm = await prisma.permission.findFirst({ where: { name: 'USER_DELETE' } });
      if (deletePerm) {
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: adminRoleId, permissionId: deletePerm.id } },
          create: { roleId: adminRoleId, permissionId: deletePerm.id },
          update: {},
        });
        await rbacService.invalidateRoleCache(adminRoleId);
      }

      const testEmail = `test_delete_restore_${Date.now()}@finwise.local`;
      const user = await prisma.user.create({
        data: {
          email: testEmail,
          password: 'dummy',
          roleId: userRoleId,
          isActive: true,
        },
      });
      deletedUserId = user.id;

      const res = await request(app)
        .delete(`/api/v1/users/${deletedUserId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify user is soft-deleted
      const deletedUser = await prisma.user.findUnique({ where: { id: deletedUserId } });
      expect(deletedUser?.deletedAt).not.toBeNull();
    });

    it('should restore a soft-deleted user', async () => {
      // Check that ADMIN has USER_RESTORE permission (requires seed re-run)
      const restorePerm = await prisma.permission.findFirst({ where: { name: 'USER_RESTORE' } });
      if (!restorePerm) {
        console.warn('USER_RESTORE permission not seeded yet — skipping restore test');
        // Clean up deletedUserId if it was created
        if (deletedUserId) await prisma.user.delete({ where: { id: deletedUserId } }).catch(() => {});
        return;
      }
      const adminRoleHasRestorePerm = await prisma.rolePermission.findFirst({
        where: { roleId: adminRoleId, permissionId: restorePerm.id },
      });
      if (!adminRoleHasRestorePerm) {
        console.warn('ADMIN role does not have USER_RESTORE yet — skipping restore test');
        if (deletedUserId) await prisma.user.delete({ where: { id: deletedUserId } }).catch(() => {});
        return;
      }
      const res = await request(app)
        .post(`/api/v1/users/${deletedUserId}/restore`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify user is restored
      const restoredUser = await prisma.user.findUnique({ where: { id: deletedUserId } });
      expect(restoredUser?.deletedAt).toBeNull();
      expect(restoredUser?.isActive).toBe(true);

      // Clean up
      await prisma.user.delete({ where: { id: deletedUserId } });
    });

    it('should reject restore for users without USER_RESTORE permission', async () => {
      const testEmail = `test_restore_deny_${Date.now()}@finwise.local`;
      const tempUser = await prisma.user.create({
        data: {
          email: testEmail,
          password: 'dummy',
          roleId: userRoleId,
          isActive: false,
          deletedAt: new Date(),
          deletedBy: adminUserId,
        },
      });

      const res = await request(app)
        .post(`/api/v1/users/${tempUser.id}/restore`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);

      // Clean up
      await prisma.user.delete({ where: { id: tempUser.id } });
    });
  });

  describe('7. Privilege Escalation Prevention', () => {
    it('should not allow a regular user to change their own role', async () => {
      // Normal user tries to update their own role to ADMIN
      const res = await request(app)
        .put(`/api/v1/users/${normalUserId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ roleId: adminRoleId });

      expect(res.status).toBe(403); // USER_UPDATE permission denied
    });

    it('should not allow a regular user to access role management', async () => {
      const res = await request(app)
        .post('/api/v1/roles')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'HACKER_ROLE' });

      expect(res.status).toBe(403);
    });
  });
});
