import bcrypt from 'bcryptjs';
import request from 'supertest';
import {
  Prisma,
  RecurringTransactionFrequency,
  TransactionType,
} from '@prisma/client';
import app from '../src/app';
import {
  addBusinessDays,
  instantToBusinessDate,
} from '../src/common/date-time/business-time';
import { prisma } from '../src/database/prisma.client';
import { RecurringTransactionEngine } from '../src/modules/recurring-transactions/recurring-transaction.engine';
import { RecurringTransactionService } from '../src/modules/recurring-transactions/recurring-transaction.service';

describe('Upgrade 6: Automated Recurring Transactions', () => {
  describe('RecurringTransactionEngine', () => {
    it('preserves the original month-end anchor without calendar drift', () => {
      expect(RecurringTransactionEngine.occurrenceAt(
        '2025-01-31',
        RecurringTransactionFrequency.MONTHLY,
        1,
        1,
      )).toBe('2025-02-28');
      expect(RecurringTransactionEngine.occurrenceAt(
        '2025-01-31',
        RecurringTransactionFrequency.MONTHLY,
        1,
        2,
      )).toBe('2025-03-31');
    });

    it('clamps leap-day yearly schedules and restores leap day later', () => {
      expect(RecurringTransactionEngine.occurrenceAt(
        '2024-02-29',
        RecurringTransactionFrequency.YEARLY,
        1,
        1,
      )).toBe('2025-02-28');
      expect(RecurringTransactionEngine.occurrenceAt(
        '2024-02-29',
        RecurringTransactionFrequency.YEARLY,
        1,
        4,
      )).toBe('2028-02-29');
    });

    it('returns deterministic previews from the immutable anchor', () => {
      expect(RecurringTransactionEngine.preview(
        '2026-01-31',
        RecurringTransactionFrequency.MONTHLY,
        1,
        '2026-02-01',
        3,
        null,
      )).toEqual(['2026-02-28', '2026-03-31', '2026-04-30']);
    });
  });

  describe('Recurring transaction API and ledger execution', () => {
    const service = new RecurringTransactionService();
    let userId: string;
    let otherUserId: string;
    let walletId: string;
    let categoryId: string;
    let authHeader: string;
    let otherAuthHeader: string;
    let scheduleId: string;
    const password = 'Password@123456';

    beforeAll(async () => {
      const role = await prisma.role.findUnique({ where: { name: 'USER' } });
      const passwordHash = await bcrypt.hash(password, 10);
      const stamp = Date.now();
      const [user, otherUser] = await Promise.all([
        prisma.user.create({
          data: {
            email: `recurring.${stamp}@example.com`,
            password: passwordHash,
            fullName: 'Recurring Test User',
            isActive: true,
            roleId: role!.id,
          },
        }),
        prisma.user.create({
          data: {
            email: `recurring.other.${stamp}@example.com`,
            password: passwordHash,
            fullName: 'Other Recurring User',
            isActive: true,
            roleId: role!.id,
          },
        }),
      ]);
      userId = user.id;
      otherUserId = otherUser.id;

      const [wallet, category] = await Promise.all([
        prisma.wallet.create({
          data: {
            userId,
            name: 'Recurring Test Wallet',
            currency: 'VND',
            balance: new Prisma.Decimal(1000000),
            isDefault: true,
          },
        }),
        prisma.category.create({
          data: {
            userId,
            name: 'Recurring Test Expense',
            type: TransactionType.EXPENSE,
          },
        }),
      ]);
      walletId = wallet.id;
      categoryId = category.id;

      const [login, otherLogin] = await Promise.all([
        request(app).post('/api/v1/auth/login').send({ email: user.email, password }),
        request(app).post('/api/v1/auth/login').send({ email: otherUser.email, password }),
      ]);
      authHeader = `Bearer ${login.body.data.accessToken}`;
      otherAuthHeader = `Bearer ${otherLogin.body.data.accessToken}`;
    });

    afterAll(async () => {
      await prisma.notification.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
      await prisma.recurringTransactionSchedule.deleteMany({
        where: { userId: { in: [userId, otherUserId] } },
      });
      await prisma.transaction.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
      await prisma.category.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
      await prisma.wallet.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
      await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
    });

    it('creates, previews, pauses, and resumes an owned schedule', async () => {
      const today = instantToBusinessDate(new Date());
      const response = await request(app)
        .post('/api/v1/recurring-transactions')
        .set('Authorization', authHeader)
        .send({
          walletId,
          categoryId,
          amount: '125000.00',
          type: 'EXPENSE',
          description: 'Monthly internet',
          frequency: 'MONTHLY',
          repeatInterval: 1,
          anchorDate: addBusinessDays(today, 1),
          missedRunPolicy: 'SKIP',
          isActive: true,
        });

      expect(response.status).toBe(201);
      expect(response.body.data.amount).toBe('125000.00');
      scheduleId = response.body.data.id;

      const preview = await request(app)
        .get(`/api/v1/recurring-transactions/${scheduleId}/preview?count=3`)
        .set('Authorization', authHeader);
      expect(preview.status).toBe(200);
      expect(preview.body.data.dates).toHaveLength(3);

      const pause = await request(app)
        .post(`/api/v1/recurring-transactions/${scheduleId}/pause`)
        .set('Authorization', authHeader);
      expect(pause.body.data.isActive).toBe(false);

      const resume = await request(app)
        .post(`/api/v1/recurring-transactions/${scheduleId}/resume`)
        .set('Authorization', authHeader);
      expect(resume.body.data.isActive).toBe(true);
    });

    it('updates recurring transaction reminder preferences and preserves them on fetch', async () => {
      const updateRes = await request(app)
        .patch(`/api/v1/recurring-transactions/${scheduleId}`)
        .set('Authorization', authHeader)
        .send({
          remindDaysBefore: 3,
        });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.remindDaysBefore).toBe(3);

      const fetched = await request(app)
        .get(`/api/v1/recurring-transactions/${scheduleId}`)
        .set('Authorization', authHeader);
      expect(fetched.status).toBe(200);
      expect(fetched.body.data.remindDaysBefore).toBe(3);

      const listRes = await request(app)
        .get('/api/v1/recurring-transactions')
        .set('Authorization', authHeader);
      expect(listRes.status).toBe(200);
      const item = listRes.body.data.find((s: any) => s.id === scheduleId);
      expect(item?.remindDaysBefore).toBe(3);

      const disableRes = await request(app)
        .patch(`/api/v1/recurring-transactions/${scheduleId}`)
        .set('Authorization', authHeader)
        .send({
          remindDaysBefore: null,
        });
      expect(disableRes.status).toBe(200);
      expect(disableRes.body.data.remindDaysBefore).toBeNull();

      const fetchedDisabled = await request(app)
        .get(`/api/v1/recurring-transactions/${scheduleId}`)
        .set('Authorization', authHeader);
      expect(fetchedDisabled.status).toBe(200);
      expect(fetchedDisabled.body.data.remindDaysBefore).toBeNull();
    });

    it('rejects cross-user schedule access', async () => {
      const response = await request(app)
        .get(`/api/v1/recurring-transactions/${scheduleId}`)
        .set('Authorization', otherAuthHeader);
      expect(response.status).toBe(404);
    });

    it('posts one occurrence exactly once and adjusts the wallet atomically', async () => {
      const today = instantToBusinessDate(new Date());
      const created = await request(app)
        .post('/api/v1/recurring-transactions')
        .set('Authorization', authHeader)
        .send({
          walletId,
          categoryId,
          amount: '50000.00',
          type: 'EXPENSE',
          description: 'Daily automated expense',
          frequency: 'DAILY',
          repeatInterval: 1,
          anchorDate: today,
          missedRunPolicy: 'CATCH_UP',
          isActive: true,
        });
      expect(created.status).toBe(201);

      const before = await prisma.wallet.findUniqueOrThrow({ where: { id: walletId } });
      await service.processDue(new Date());
      await service.processDue(new Date());
      const after = await prisma.wallet.findUniqueOrThrow({ where: { id: walletId } });
      const occurrences = await prisma.recurringTransactionOccurrence.findMany({
        where: { scheduleId: created.body.data.id, scheduledFor: new Date(`${today}T00:00:00.000Z`) },
      });

      expect(before.balance.minus(after.balance).toFixed(2)).toBe('50000.00');
      expect(occurrences).toHaveLength(1);
      expect(occurrences[0].status).toBe('POSTED');
      expect(occurrences[0].transactionId).not.toBeNull();
    });

    it('pauses safely without ledger mutation when a relation becomes archived', async () => {
      const today = instantToBusinessDate(new Date());
      const created = await request(app)
        .post('/api/v1/recurring-transactions')
        .set('Authorization', authHeader)
        .send({
          walletId,
          categoryId,
          amount: '75000.00',
          type: 'EXPENSE',
          description: 'Failure test',
          frequency: 'DAILY',
          repeatInterval: 1,
          anchorDate: today,
          missedRunPolicy: 'CATCH_UP',
          isActive: true,
        });
      const balanceBefore = await prisma.wallet.findUniqueOrThrow({ where: { id: walletId } });
      await prisma.wallet.update({ where: { id: walletId }, data: { isArchived: true } });

      await service.processDue(new Date());

      const [schedule, occurrence, balanceAfter] = await Promise.all([
        prisma.recurringTransactionSchedule.findUniqueOrThrow({ where: { id: created.body.data.id } }),
        prisma.recurringTransactionOccurrence.findUniqueOrThrow({
          where: {
            scheduleId_scheduledFor: {
              scheduleId: created.body.data.id,
              scheduledFor: new Date(`${today}T00:00:00.000Z`),
            },
          },
        }),
        prisma.wallet.findUniqueOrThrow({ where: { id: walletId } }),
      ]);
      expect(schedule.isActive).toBe(false);
      expect(occurrence.status).toBe('FAILED');
      expect(balanceAfter.balance.toFixed(2)).toBe(balanceBefore.balance.toFixed(2));

      await prisma.wallet.update({ where: { id: walletId }, data: { isArchived: false } });
    });
  });
});
