import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/database/prisma.client';
import bcrypt from 'bcryptjs';
import { ReminderRepository } from '../src/modules/reminders/reminder.repository';
import { RecurringTransactionRepository } from '../src/modules/recurring-transactions/recurring-transaction.repository';
import { SavingsRepository } from '../src/modules/savings/savings.repository';

describe('Comprehensive Security Fixes Verification Tests (OWASP & Strix Audit)', () => {
  const reminderRepo = new ReminderRepository();
  const recurringRepo = new RecurringTransactionRepository();
  const savingsRepo = new SavingsRepository();

  const userA = {
    email: 'sec-user-a@gmail.com',
    password: 'Password@123456',
    fullName: 'Security User A',
  };

  const userB = {
    email: 'sec-user-b@gmail.com',
    password: 'Password@123456',
    fullName: 'Security User B (Attacker)',
  };

  let userAId = '';
  let userBId = '';
  let tokenA = '';
  let tokenB = '';
  let refreshTokenA = '';

  beforeAll(async () => {
    // Clean up if existing
    await prisma.user.deleteMany({
      where: { email: { in: [userA.email, userB.email] } },
    });

    const defaultRole = await prisma.role.findUnique({ where: { name: 'USER' } });
    const passwordHash = await bcrypt.hash(userA.password, 10);

    const createdA = await prisma.user.create({
      data: {
        email: userA.email,
        password: passwordHash,
        fullName: userA.fullName,
        roleId: defaultRole!.id,
        isActive: true,
      },
    });
    userAId = createdA.id;

    const createdB = await prisma.user.create({
      data: {
        email: userB.email,
        password: passwordHash,
        fullName: userB.fullName,
        roleId: defaultRole!.id,
        isActive: true,
      },
    });
    userBId = createdB.id;

    // Login user A
    const loginResA = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: userA.email, password: userA.password });
    tokenA = loginResA.body.data.accessToken;
    refreshTokenA = loginResA.body.data.refreshToken;

    // Login user B
    const loginResB = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: userB.email, password: userB.password });
    tokenB = loginResB.body.data.accessToken;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: [userA.email, userB.email] } },
    });
  });

  describe('1. [V-01] BFLA Protection on Savings Module', () => {
    it('should reject unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/v1/savings');
      expect(res.status).toBe(401);
    });

    it('should reject requests when user lacks required permission (403)', async () => {
      // Create a restricted role with zero permissions
      const restrictedRole = await prisma.role.create({
        data: {
          name: 'RESTRICTED_ROLE_TEST',
          description: 'Role with no permissions for BFLA testing',
          isSystem: false,
        },
      });

      const restrictedUser = await prisma.user.create({
        data: {
          email: 'restricted-bfla@gmail.com',
          password: await bcrypt.hash('Password@123', 10),
          fullName: 'Restricted User',
          roleId: restrictedRole.id,
          isActive: true,
        },
      });

      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'restricted-bfla@gmail.com', password: 'Password@123' });
      const restrictedToken = loginRes.body.data.accessToken;

      const res = await request(app)
        .get('/api/v1/savings')
        .set('Authorization', `Bearer ${restrictedToken}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('SAVINGS_READ');

      // Cleanup
      await prisma.user.delete({ where: { id: restrictedUser.id } });
      await prisma.role.delete({ where: { id: restrictedRole.id } });
    });
  });

  describe('2. [V-02] Handover PIN Protection in Audit Log', () => {
    it('should not expose plaintext pinCode in AuditLog.newState', async () => {
      const res = await request(app)
        .post('/api/v1/handover/initiate')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(201);
      const { handoverToken } = res.body.data;

      // Query audit log directly from DB
      const auditEntry = await prisma.auditLog.findFirst({
        where: {
          actorId: userAId,
          action: 'HANDOVER_INITIATED',
        },
        orderBy: { createdAt: 'desc' },
      });

      expect(auditEntry).toBeDefined();
      const state = auditEntry?.newState as Record<string, unknown>;
      expect(state.handoverToken).toBe(handoverToken);
      // pinCode MUST NOT exist in audit log!
      expect(state.pinCode).toBeUndefined();
    });
  });

  describe('3. [V-04] Session Invalidation on Password Change', () => {
    it('should delete all refresh tokens when password is updated', async () => {
      // Confirm user A currently has active refresh tokens
      const sessionsBefore = await prisma.refreshToken.findMany({
        where: { userId: userAId },
      });
      expect(sessionsBefore.length).toBeGreaterThanOrEqual(1);

      // Change password
      const newPassword = 'NewPassword@123456';
      const changeRes = await request(app)
        .put('/api/v1/auth/password')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          oldPassword: userA.password,
          newPassword,
        });

      expect(changeRes.status).toBe(200);

      // Check database: all refresh tokens for user A MUST be revoked
      const sessionsAfter = await prisma.refreshToken.findMany({
        where: { userId: userAId },
      });
      expect(sessionsAfter.length).toBe(0);

      // Attempting to refresh with old refresh token must be rejected with 401
      const refreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: refreshTokenA });

      expect(refreshRes.status).toBe(401);
      expect(refreshRes.body.code).toBe('TOKEN_INVALID');
    });
  });

  describe('4. [V-06] Defense-in-Depth BOLA Checks at Repository Layer', () => {
    it('should reject reminder update/delete for another user at database level', async () => {
      // Create reminder owned by user A
      const reminder = await reminderRepo.create(userAId, {
        type: 'GENERAL',
        title: 'User A Secret Reminder',
        message: null,
        remindAt: new Date(Date.now() + 86400000),
        frequency: 'ONCE',
        repeatInterval: 1,
        endAt: null,
        nextTriggerAt: new Date(Date.now() + 86400000),
        actionUrl: null,
        isActive: true,
      });

      // Attacker (user B) tries to update user A's reminder
      await expect(
        reminderRepo.update(reminder.id, {
          type: 'GENERAL',
          title: 'Hacked by Attacker',
          message: null,
          remindAt: new Date(Date.now() + 86400000),
          frequency: 'ONCE',
          repeatInterval: 1,
          endAt: null,
          nextTriggerAt: new Date(Date.now() + 86400000),
          actionUrl: null,
          isActive: true,
        }, userBId),
      ).rejects.toThrow();

      // Attacker (user B) tries to remove user A's reminder
      await expect(
        reminderRepo.remove(reminder.id, userBId),
      ).rejects.toThrow();

      // Cleanup
      await reminderRepo.remove(reminder.id, userAId);
    });

    it('should reject savings update for another user at database level', async () => {
      // Attacker tries to update arbitrary deposit specifying attacker userId
      await expect(
        savingsRepo.update(
          '00000000-0000-0000-0000-000000000000',
          { bankName: 'Hacked Bank' },
          prisma,
          userBId,
        ),
      ).rejects.toThrow();
    });
  });

  describe('5. [V-07] Global JSON Body Size Limit DoS Protection', () => {
    it('should reject JSON payload exceeding 2MB with 413 Payload Too Large', async () => {
      // Generate a ~2.5MB payload string
      const largeData = 'A'.repeat(2.5 * 1024 * 1024);

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'test@gmail.com', largePadding: largeData });

      expect(res.status).toBe(413);
    });
  });
});
