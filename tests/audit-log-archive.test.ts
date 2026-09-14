import request from 'supertest';
import fs from 'fs';
import zlib from 'zlib';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import { prisma } from '../src/database/prisma.client';
import { jwtConfig } from '../src/config/jwt.config';
import { SYSTEM_ROLES } from '../src/common/constants';
import { auditLogArchiveService } from '../src/modules/audit-logs/audit-log-archive.service';

describe('Audit Log Archive & 30-Day Cleanup Integration Tests', () => {
  let adminToken: string;
  let userToken: string;
  let adminUserId: string;
  let normalUserId: string;
  let oldLogId: string;
  let recentLogId: string;
  let createdArchiveFilePaths: string[] = [];

  beforeAll(async () => {
    const adminRole = await prisma.role.findUnique({ where: { name: SYSTEM_ROLES.ADMIN } });
    const userRole = await prisma.role.findUnique({ where: { name: SYSTEM_ROLES.USER } });

    let admin = await prisma.user.findFirst({ where: { email: 'admin@finwise.local' } });
    if (!admin) {
      admin = await prisma.user.create({
        data: {
          email: 'admin@finwise.local',
          password: 'dummy',
          roleId: adminRole!.id,
          isActive: true,
        },
      });
    }
    adminUserId = admin.id;

    let user = await prisma.user.findFirst({ where: { email: 'user@finwise.local' } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: 'user@finwise.local',
          password: 'dummy',
          roleId: userRole!.id,
          isActive: true,
        },
      });
    }
    normalUserId = user.id;

    adminToken = jwt.sign(
      { id: adminUserId, email: admin.email, role: adminRole!.name, roleId: adminRole!.id },
      jwtConfig.accessSecret,
      { expiresIn: '1h' },
    );

    userToken = jwt.sign(
      { id: normalUserId, email: user.email, role: userRole!.name, roleId: userRole!.id },
      jwtConfig.accessSecret,
      { expiresIn: '1h' },
    );
  });

  afterAll(async () => {
    // Clean up archive test files created during test
    for (const filePath of createdArchiveFilePaths) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch {
        // ignore
      }
    }
  });

  it('should archive and purge logs older than 30 days while preserving recent logs', async () => {
    const thirtyFiveDaysAgo = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

    const oldLog = await prisma.auditLog.create({
      data: {
        actorId: adminUserId,
        action: 'TEST_OLD_ACTION',
        targetType: 'SYSTEM',
        targetId: 'old-target-1',
        createdAt: thirtyFiveDaysAgo,
      },
    });
    oldLogId = oldLog.id;

    const recentLog = await prisma.auditLog.create({
      data: {
        actorId: adminUserId,
        action: 'TEST_RECENT_ACTION',
        targetType: 'SYSTEM',
        targetId: 'recent-target-1',
        createdAt: fiveDaysAgo,
      },
    });
    recentLogId = recentLog.id;

    const result = await auditLogArchiveService.archiveAndCleanup({
      retentionDays: 30,
      actorId: adminUserId,
      triggerSource: 'MANUAL',
    });

    expect(result.success).toBe(true);
    expect(result.archivedCount).toBeGreaterThanOrEqual(1);
    expect(result.archivePath).toBeDefined();

    if (result.archivePath) {
      createdArchiveFilePaths.push(result.archivePath);
      expect(fs.existsSync(result.archivePath)).toBe(true);

      const compressed = fs.readFileSync(result.archivePath);
      const decompressed = zlib.gunzipSync(compressed).toString('utf-8');
      const parsed = JSON.parse(decompressed);

      expect(parsed.metadata).toBeDefined();
      expect(parsed.metadata.retentionDays).toBe(30);
      expect(parsed.records).toBeDefined();

      const archivedOldRecord = parsed.records.find((r: any) => r.id === oldLogId);
      expect(archivedOldRecord).toBeDefined();
      expect(archivedOldRecord.action).toBe('TEST_OLD_ACTION');
    }

    // Verify old log is deleted from database
    const foundOldLog = await prisma.auditLog.findUnique({ where: { id: oldLogId } });
    expect(foundOldLog).toBeNull();

    // Verify recent log is preserved in database
    const foundRecentLog = await prisma.auditLog.findUnique({ where: { id: recentLogId } });
    expect(foundRecentLog).not.toBeNull();
    expect(foundRecentLog!.action).toBe('TEST_RECENT_ACTION');

    // Verify an audit log entry for the cleanup operation was created
    const cleanupAuditLog = await prisma.auditLog.findFirst({
      where: {
        action: 'AUDIT_LOGS_ARCHIVE_CLEANUP',
        targetType: 'AUDIT_LOG',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(cleanupAuditLog).not.toBeNull();

    // Clean up recent log
    await prisma.auditLog.deleteMany({ where: { id: recentLogId } });
  });

  it('should return 0 archivedCount gracefully if no logs are older than retention days', async () => {
    const result = await auditLogArchiveService.archiveAndCleanup({
      retentionDays: 365,
    });

    expect(result.success).toBe(true);
    expect(result.archivedCount).toBe(0);
  });

  it('should reject unauthenticated request to POST /api/v1/audit-logs/archive-cleanup', async () => {
    const res = await request(app).post('/api/v1/audit-logs/archive-cleanup').send({});
    expect(res.status).toBe(401);
  });

  it('should reject non-admin request to POST /api/v1/audit-logs/archive-cleanup with 403', async () => {
    const res = await request(app)
      .post('/api/v1/audit-logs/archive-cleanup')
      .set('Authorization', `Bearer ${userToken}`)
      .send({});

    expect(res.status).toBe(403);
  });

  it('should allow admin request to POST /api/v1/audit-logs/archive-cleanup with 200', async () => {
    const res = await request(app)
      .post('/api/v1/audit-logs/archive-cleanup')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ retentionDays: 30 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.retentionDays).toBe(30);
    if (res.body.data.archivePath) {
      createdArchiveFilePaths.push(res.body.data.archivePath);
    }
  });
});
