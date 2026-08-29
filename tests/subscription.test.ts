import request from 'supertest';
import bcrypt from 'bcryptjs';
import { Prisma, TransactionType } from '@prisma/client';
import app from '../src/app';
import { prisma } from '../src/database/prisma.client';
import { RawSubscriptionTxn, SubscriptionDiscoveryEngine } from '../src/modules/subscriptions/subscription-engine';
import { BusinessDate } from '../src/common/date-time/business-time';

describe('Upgrade 4: Auto Subscription Discovery', () => {
  describe('SubscriptionDiscoveryEngine Unit Tests', () => {
    it('should normalize raw payment description strings', () => {
      expect(SubscriptionDiscoveryEngine.normalizeMerchant('NAP TIEN NETFLIX*198293')).toBe('NETFLIX');
      expect(SubscriptionDiscoveryEngine.normalizeMerchant('THANH TOAN SPOTIFY PREMIUM')).toBe('SPOTIFY PREMIUM');
      expect(SubscriptionDiscoveryEngine.normalizeMerchant('GD 91823 ICLOUD STORAGE')).toBe('ICLOUD STORAGE');
    });

    it('should discover monthly recurring subscriptions and detect price drift', () => {
      const transactions: RawSubscriptionTxn[] = [
        {
          id: 'tx-1',
          description: 'NETFLIX PREMIUM',
          amount: 260000,
          currency: 'VND',
          categoryId: 'cat-1',
          categoryName: 'Entertainment',
          date: '2026-05-05' as BusinessDate,
        },
        {
          id: 'tx-2',
          description: 'NETFLIX PREMIUM',
          amount: 260000,
          currency: 'VND',
          categoryId: 'cat-1',
          categoryName: 'Entertainment',
          date: '2026-06-05' as BusinessDate,
        },
        {
          id: 'tx-3',
          description: 'NETFLIX PREMIUM',
          amount: 260000,
          currency: 'VND',
          categoryId: 'cat-1',
          categoryName: 'Entertainment',
          date: '2026-07-05' as BusinessDate,
        },
        {
          id: 'tx-4',
          description: 'NETFLIX PREMIUM',
          amount: 280000, // Price hike!
          currency: 'VND',
          categoryId: 'cat-1',
          categoryName: 'Entertainment',
          date: '2026-08-05' as BusinessDate,
        },
      ];

      const discovered = SubscriptionDiscoveryEngine.discover(transactions, new Set());

      expect(discovered).toHaveLength(1);
      const sub = discovered[0];
      expect(sub.merchantName).toBe('NETFLIX PREMIUM');
      expect(sub.frequency).toBe('MONTHLY');
      expect(sub.occurrenceCount).toBe(4);
      expect(sub.confidenceScore).toBeGreaterThanOrEqual(0.85);
      expect(sub.isPriceDrift).toBe(true);
      expect(sub.nextExpectedAt).toBe('2026-09-05');
    });

    it('should ignore irregular one-off purchases', () => {
      const transactions: RawSubscriptionTxn[] = [
        {
          id: 'tx-1',
          description: 'SHOPEE ORDER',
          amount: 150000,
          currency: 'VND',
          categoryId: 'cat-2',
          categoryName: 'Shopping',
          date: '2026-05-01' as BusinessDate,
        },
        {
          id: 'tx-2',
          description: 'SHOPEE ORDER',
          amount: 800000,
          currency: 'VND',
          categoryId: 'cat-2',
          categoryName: 'Shopping',
          date: '2026-05-03' as BusinessDate,
        },
      ];

      const discovered = SubscriptionDiscoveryEngine.discover(transactions, new Set());
      expect(discovered).toHaveLength(0);
    });
  });

  describe('Subscription API Integration Tests', () => {
    let testUserId: string;
    let testWalletId: string;
    let testCategoryId: string;
    let authHeader: string;

    beforeAll(async () => {
      const defaultRole = await prisma.role.findUnique({ where: { name: 'USER' } });
      const password = 'Password@123456';
      const passwordHash = await bcrypt.hash(password, 10);
      const email = `sub.test.${Date.now()}@example.com`;

      const user = await prisma.user.create({
        data: {
          email,
          password: passwordHash,
          fullName: 'Subscription Test User',
          isActive: true,
          roleId: defaultRole!.id,
        },
      });
      testUserId = user.id;

      const wallet = await prisma.wallet.create({
        data: {
          userId: testUserId,
          name: 'Sub Test Wallet',
          currency: 'VND',
          balance: new Prisma.Decimal(5000000),
          isDefault: true,
        },
      });
      testWalletId = wallet.id;

      const category = await prisma.category.create({
        data: {
          userId: testUserId,
          name: 'Subscriptions & Bills',
          type: TransactionType.EXPENSE,
        },
      });
      testCategoryId = category.id;

      // Seed 4 monthly Spotify transactions
      const dates = [
        new Date('2026-05-10T00:00:00.000Z'),
        new Date('2026-06-10T00:00:00.000Z'),
        new Date('2026-07-10T00:00:00.000Z'),
        new Date('2026-08-10T00:00:00.000Z'),
      ];

      for (const d of dates) {
        await prisma.transaction.create({
          data: {
            userId: testUserId,
            walletId: testWalletId,
            categoryId: testCategoryId,
            amount: new Prisma.Decimal(59000),
            type: TransactionType.EXPENSE,
            description: 'SPOTIFY PREMIUM MONTHLY',
            date: d,
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
      await prisma.reminder.deleteMany({ where: { userId: testUserId } });
      await prisma.transaction.deleteMany({ where: { userId: testUserId } });
      await prisma.category.deleteMany({ where: { userId: testUserId } });
      await prisma.wallet.deleteMany({ where: { userId: testUserId } });
      await prisma.user.deleteMany({ where: { id: testUserId } });
    });

    it('GET /api/v1/subscriptions/discover should identify Spotify recurring subscription', async () => {
      const res = await request(app)
        .get('/api/v1/subscriptions/discover')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalDiscovered).toBeGreaterThanOrEqual(1);

      const spotify = res.body.data.items.find(
        (i: { merchantName: string }) => i.merchantName.includes('SPOTIFY'),
      );
      expect(spotify).toBeDefined();
      expect(spotify.frequency).toBe('MONTHLY');
      expect(parseFloat(spotify.averageAmount)).toBeCloseTo(59000, 0);
    });

    it('POST /api/v1/subscriptions/convert-to-reminder should create an active reminder', async () => {
      const res = await request(app)
        .post('/api/v1/subscriptions/convert-to-reminder')
        .set('Authorization', authHeader)
        .send({
          merchantName: 'Spotify Premium',
          amount: '59000.00',
          frequency: 'MONTHLY',
          remindAt: '2026-09-10T02:00:00.000Z',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.title).toBe('Spotify Premium');
    });
  });
});
