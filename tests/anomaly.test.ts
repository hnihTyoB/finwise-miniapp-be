import request from 'supertest';
import bcrypt from 'bcryptjs';
import { Prisma, TransactionType } from '@prisma/client';
import app from '../src/app';
import { prisma } from '../src/database/prisma.client';
import { AnomalyMathEngine } from '../src/modules/anomalies/anomaly-math';

describe('Upgrade 3: Multi-dimensional Anomaly Detection', () => {
  describe('AnomalyMathEngine Unit Tests', () => {
    it('should detect category spending spikes using Modified Z-score (MAD)', () => {
      // Normal coffee spending is 35k - 45k
      const historicalCategoryAmounts = [35000, 40000, 42000, 38000, 45000, 39000, 41000];

      // A sudden 350k coffee transaction
      const evaluation = AnomalyMathEngine.evaluate({
        amount: 350000,
        historicalCategoryAmounts,
        recentWalletTxnCount: 0,
        walletBalance: 10000000,
        hourOfDayVietnam: 14,
      });

      expect(evaluation.isAnomaly).toBe(true);
      expect(evaluation.reasonCodes).toContain('SPIKE_VS_CATEGORY_MEDIAN');
      expect(evaluation.anomalyScore).toBeGreaterThanOrEqual(0.70);
      expect(evaluation.metrics.modifiedZScore).toBeGreaterThan(3.5);
    });

    it('should identify velocity burst and off-peak anomalies', () => {
      const evaluation = AnomalyMathEngine.evaluate({
        amount: 150000,
        historicalCategoryAmounts: [140000, 150000, 160000],
        recentWalletTxnCount: 4, // 4 txns in 20 minutes
        walletBalance: 2000000,
        hourOfDayVietnam: 3, // 3am
      });

      expect(evaluation.reasonCodes).toContain('VELOCITY_BURST');
      expect(evaluation.reasonCodes).toContain('OFF_PEAK_SURGE');
    });

    it('should classify normal transactions as NORMAL with isAnomaly=false', () => {
      const evaluation = AnomalyMathEngine.evaluate({
        amount: 42000,
        historicalCategoryAmounts: [35000, 40000, 42000, 38000, 45000],
        recentWalletTxnCount: 1,
        walletBalance: 5000000,
        hourOfDayVietnam: 12,
      });

      expect(evaluation.isAnomaly).toBe(false);
      expect(evaluation.severity).toBe('NORMAL');
      expect(evaluation.reasonCodes).toHaveLength(0);
    });
  });

  describe('Anomaly API Integration Tests', () => {
    let testUserId: string;
    let testWalletId: string;
    let testCategoryId: string;
    let authHeader: string;

    beforeAll(async () => {
      const defaultRole = await prisma.role.findUnique({ where: { name: 'USER' } });
      const password = 'Password@123456';
      const passwordHash = await bcrypt.hash(password, 10);
      const email = `anomaly.test.${Date.now()}@example.com`;

      const user = await prisma.user.create({
        data: {
          email,
          password: passwordHash,
          fullName: 'Anomaly Test User',
          isActive: true,
          roleId: defaultRole!.id,
        },
      });
      testUserId = user.id;

      const wallet = await prisma.wallet.create({
        data: {
          userId: testUserId,
          name: 'Anomaly Test Wallet',
          currency: 'VND',
          balance: new Prisma.Decimal(5000000),
          isDefault: true,
        },
      });
      testWalletId = wallet.id;

      const category = await prisma.category.create({
        data: {
          userId: testUserId,
          name: 'Cafe & Drinks',
          type: TransactionType.EXPENSE,
        },
      });
      testCategoryId = category.id;

      // Populate typical historical transactions (~40k)
      const now = new Date();
      for (let i = 1; i <= 6; i++) {
        await prisma.transaction.create({
          data: {
            userId: testUserId,
            walletId: testWalletId,
            categoryId: testCategoryId,
            amount: new Prisma.Decimal(40000),
            type: TransactionType.EXPENSE,
            description: `Cafe ${i}`,
            date: now,
          },
        });
      }

      // Login
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email, password });

      authHeader = `Bearer ${loginRes.body.data.accessToken}`;
    });

    afterAll(async () => {
      await prisma.notification.deleteMany({ where: { userId: testUserId } });
      await prisma.transaction.deleteMany({ where: { userId: testUserId } });
      await prisma.category.deleteMany({ where: { userId: testUserId } });
      await prisma.wallet.deleteMany({ where: { userId: testUserId } });
      await prisma.user.deleteMany({ where: { id: testUserId } });
    });

    it('POST /api/v1/anomalies/evaluate should return anomaly score and reason codes for spikes', async () => {
      const res = await request(app)
        .post('/api/v1/anomalies/evaluate')
        .set('Authorization', authHeader)
        .send({
          walletId: testWalletId,
          categoryId: testCategoryId,
          amount: '500000.00', // 12x normal 40k cafe
          type: 'EXPENSE',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isAnomaly).toBe(true);
      expect(res.body.data.anomalyScore).toBeGreaterThanOrEqual(0.70);
      expect(res.body.data.reasonCodes).toContain('SPIKE_VS_CATEGORY_MEDIAN');
    });

    it('POST /api/v1/transactions with anomaly amount should trigger UNUSUAL_TRANSACTION notification', async () => {
      const createRes = await request(app)
        .post('/api/v1/transactions')
        .set('Authorization', authHeader)
        .send({
          walletId: testWalletId,
          categoryId: testCategoryId,
          amount: '800000.00',
          type: 'EXPENSE',
          description: 'Expensive cafe group treat',
          date: '2026-08-19',
        });

      expect(createRes.status).toBe(201);

      // Check that a notification was created
      const notifRes = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', authHeader);

      expect(notifRes.status).toBe(200);
      const notifications = Array.isArray(notifRes.body.data) ? notifRes.body.data : [];
      expect(notifications.length).toBeGreaterThanOrEqual(1);

      const unusualNotif = notifications.find(
        (n: { type: string }) => n.type === 'UNUSUAL_TRANSACTION',
      );
      expect(unusualNotif).toBeDefined();
    });
  });
});
