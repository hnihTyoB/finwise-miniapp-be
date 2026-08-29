import request from 'supertest';
import bcrypt from 'bcryptjs';
import { Prisma, TransactionType } from '@prisma/client';
import app from '../src/app';
import { prisma } from '../src/database/prisma.client';
import { ForecastMathEngine } from '../src/modules/forecast/forecast-math';
import {
  BusinessDate,
  businessWallTimeToInstant,
  instantToBusinessDate,
} from '../src/common/date-time/business-time';

describe('Upgrade 1: Cash Flow Runway & Budget Forecaster', () => {
  describe('ForecastMathEngine Unit Tests', () => {
    const asOfDate: BusinessDate = '2026-08-19';

    it('should return INSUFFICIENT data sufficiency when transaction count is low', () => {
      const result = ForecastMathEngine.computeRunway(
        new Prisma.Decimal(10000000),
        [],
        30,
        asOfDate,
        2,
      );

      expect(result.dataSufficiency).toBe('INSUFFICIENT');
      expect(result.metrics.averageDailyIncome).toBe('0.00');
      expect(result.metrics.weightedDailyExpense).toBe('0.00');
      expect(result.metrics.projectedEndBalance).toBe('10000000.00');
      expect(result.series).toHaveLength(30);
    });

    it('should calculate weighted daily burn rate and predict depletion date', () => {
      const dailyBuckets = [
        { date: '2026-08-10' as BusinessDate, income: new Prisma.Decimal(0), expense: new Prisma.Decimal(500000) },
        { date: '2026-08-11' as BusinessDate, income: new Prisma.Decimal(0), expense: new Prisma.Decimal(500000) },
        { date: '2026-08-12' as BusinessDate, income: new Prisma.Decimal(0), expense: new Prisma.Decimal(500000) },
        { date: '2026-08-13' as BusinessDate, income: new Prisma.Decimal(0), expense: new Prisma.Decimal(500000) },
        { date: '2026-08-14' as BusinessDate, income: new Prisma.Decimal(0), expense: new Prisma.Decimal(500000) },
        { date: '2026-08-15' as BusinessDate, income: new Prisma.Decimal(0), expense: new Prisma.Decimal(500000) },
      ];

      const currentBalance = new Prisma.Decimal(5000000); // 5M balance with 500k/day burn rate => 10 days runway
      const result = ForecastMathEngine.computeRunway(
        currentBalance,
        dailyBuckets,
        30,
        asOfDate,
        15,
      );

      expect(result.dataSufficiency).toBe('SPARSE');
      expect(parseFloat(result.metrics.weightedDailyExpense)).toBeCloseTo(500000, 0);
      expect(result.metrics.runwayDays).toBe(10);
      expect(result.metrics.isDepletionProjected).toBe(true);
      expect(result.metrics.depletionDate).toBe('2026-08-29');

      // Confidence bounds should expand as horizon h grows
      const day1Spread =
        parseFloat(result.series[0].upperBound95) - parseFloat(result.series[0].lowerBound95);
      const day30Spread =
        parseFloat(result.series[29].upperBound95) - parseFloat(result.series[29].lowerBound95);
      expect(day30Spread).toBeGreaterThanOrEqual(day1Spread);
    });

    it('should correctly predict budget exhaustion date and risk level', () => {
      const budgets = [
        {
          id: 'budget-1',
          name: 'Dining August',
          categoryName: 'Dining',
          currency: 'VND',
          amount: new Prisma.Decimal(3000000), // 3M budget
          spentAmount: new Prisma.Decimal(2400000), // Spent 2.4M in first 19 days => ~126k/day
          startDate: '2026-08-01' as BusinessDate,
          endDate: '2026-08-31' as BusinessDate,
          alertThreshold: new Prisma.Decimal(80),
        },
      ];

      const results = ForecastMathEngine.computeBudgetDepletions(budgets, '2026-08-19' as BusinessDate);
      expect(results).toHaveLength(1);
      const item = results[0];

      expect(item.daysElapsed).toBe(19);
      expect(item.daysRemaining).toBe(12);
      expect(item.isExhaustionProjected).toBe(true);
      expect(item.daysEarly).toBeGreaterThan(0);
      expect(['HIGH', 'CRITICAL']).toContain(item.riskLevel);
    });
  });

  describe('Forecast API Integration Tests', () => {
    let testUserId: string;
    let testWalletId: string;
    let testCategoryId: string;
    let authHeader: string;

    beforeAll(async () => {
      const defaultRole = await prisma.role.findUnique({ where: { name: 'USER' } });
      const password = 'Password@123456';
      const passwordHash = await bcrypt.hash(password, 10);
      const email = `forecast.test.${Date.now()}@example.com`;

      const user = await prisma.user.create({
        data: {
          email,
          password: passwordHash,
          fullName: 'Forecast Test User',
          isActive: true,
          roleId: defaultRole!.id,
        },
      });
      testUserId = user.id;

      // Create test wallet with 10M VND
      const wallet = await prisma.wallet.create({
        data: {
          userId: testUserId,
          name: 'Forecast Test Wallet',
          currency: 'VND',
          balance: new Prisma.Decimal(10000000),
          isDefault: true,
        },
      });
      testWalletId = wallet.id;

      // Create test category
      const category = await prisma.category.create({
        data: {
          userId: testUserId,
          name: 'Food & Dining',
          type: TransactionType.EXPENSE,
        },
      });
      testCategoryId = category.id;

      // Login to get token
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email, password });

      authHeader = `Bearer ${loginRes.body.data.accessToken}`;

      // Populate 10 days of expense transactions
      const now = new Date();
      const today = instantToBusinessDate(now);
      for (let i = 1; i <= 10; i++) {
        const txDate = businessWallTimeToInstant(today);
        txDate.setUTCDate(txDate.getUTCDate() - i);

        await prisma.transaction.create({
          data: {
            userId: testUserId,
            walletId: testWalletId,
            categoryId: testCategoryId,
            amount: new Prisma.Decimal(300000),
            type: TransactionType.EXPENSE,
            description: `Lunch day -${i}`,
            date: txDate,
          },
        });
      }

      // Create active budget for current month
      const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const endOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));

      await prisma.budget.create({
        data: {
          userId: testUserId,
          categoryId: testCategoryId,
          name: 'Monthly Dining Forecast',
          amount: new Prisma.Decimal(5000000),
          currency: 'VND',
          startDate: startOfMonth,
          endDate: endOfMonth,
        },
      });
    });

    afterAll(async () => {
      // Clean up test data
      await prisma.transaction.deleteMany({ where: { userId: testUserId } });
      await prisma.budget.deleteMany({ where: { userId: testUserId } });
      await prisma.category.deleteMany({ where: { userId: testUserId } });
      await prisma.wallet.deleteMany({ where: { userId: testUserId } });
      await prisma.user.deleteMany({ where: { id: testUserId } });
    });

    it('GET /api/v1/forecast/runway should return valid forecast trajectory', async () => {
      const res = await request(app)
        .get('/api/v1/forecast/runway')
        .set('Authorization', authHeader)
        .query({ horizonDays: 30, currency: 'VND' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.currency).toBe('VND');
      expect(res.body.data.series).toHaveLength(30);
      expect(res.body.data.metrics).toBeDefined();
      expect(parseFloat(res.body.data.metrics.weightedDailyExpense)).toBeGreaterThan(0);
    });

    it('GET /api/v1/forecast/budget-depletion should return active budget pace analysis', async () => {
      const res = await request(app)
        .get('/api/v1/forecast/budget-depletion')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);

      const item = res.body.data.items.find(
        (b: { budgetName: string }) => b.budgetName === 'Monthly Dining Forecast',
      );
      expect(item).toBeDefined();
      expect(item.currentDailyBurn).toBeDefined();
      expect(item.riskLevel).toBeDefined();
    });
  });
});
