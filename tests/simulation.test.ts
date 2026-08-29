import request from 'supertest';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import app from '../src/app';
import { prisma } from '../src/database/prisma.client';
import { SimulationEngine } from '../src/modules/simulations/simulation-engine';

describe('Upgrade 2: What-if Financial Simulation Sandbox', () => {
  describe('SimulationEngine Unit Tests', () => {
    it('should compute monthly baseline and simulated trajectory with recurring perturbation', () => {
      const baseline = {
        startingBalance: new Prisma.Decimal(20000000), // 20M
        dailyIncome: 1000000, // ~30.4M/mo
        dailyExpense: 600000, // ~18.2M/mo => net ~ +12.2M/mo
        categoryDailyExpenses: new Map<string, number>([['cat-dining', 200000]]),
        savingGoals: [
          {
            id: 'goal-1',
            name: 'Emergency Fund',
            targetAmount: new Prisma.Decimal(50000000),
            savedAmount: new Prisma.Decimal(10000000),
            targetDate: '2027-12-31',
          },
        ],
        startYear: 2026,
        startMonth: 8,
      };

      const perturbations = [
        {
          type: 'RECURRING_EXPENSE' as const,
          name: 'Loan Installment',
          amount: '5000000.00', // 5M/mo
          startMonth: 1,
          durationMonths: 6,
        },
      ];

      const result = SimulationEngine.run(baseline, perturbations, 12, 'VND');

      expect(result.horizonMonths).toBe(12);
      expect(result.monthlyComparison).toHaveLength(12);

      // Month 1 should reflect 5M expense delta
      expect(parseFloat(result.monthlyComparison[0].monthlyDelta)).toBeCloseTo(-5000000, 0);

      // Total 6 months of 5M = 30M delta
      const netDelta = parseFloat(result.summary.netDelta);
      expect(netDelta).toBeCloseTo(-30000000, 0);
      expect(result.summary.isDeficitProjected).toBe(false);
      expect(result.goalImpacts).toHaveLength(1);
    });

    it('should identify when a scenario drives the balance into a projected deficit', () => {
      const baseline = {
        startingBalance: new Prisma.Decimal(5000000), // 5M
        dailyIncome: 0,
        dailyExpense: 200000, // 6M/mo burn rate
        categoryDailyExpenses: new Map<string, number>(),
        savingGoals: [],
        startYear: 2026,
        startMonth: 8,
      };

      const perturbations = [
        {
          type: 'ONE_OFF_EXPENSE' as const,
          name: 'Big purchase',
          amount: '10000000.00', // 10M at month 1 => deficit!
          targetMonth: 1,
        },
      ];

      const result = SimulationEngine.run(baseline, perturbations, 6, 'VND');
      expect(result.summary.isDeficitProjected).toBe(true);
      expect(result.summary.riskAssessment).toBe('HIGH_DEFICIT_RISK');
    });
  });

  describe('Simulation API Integration Tests', () => {
    let testUserId: string;
    let authHeader: string;

    beforeAll(async () => {
      const defaultRole = await prisma.role.findUnique({ where: { name: 'USER' } });
      const password = 'Password@123456';
      const passwordHash = await bcrypt.hash(password, 10);
      const email = `sim.test.${Date.now()}@example.com`;

      const user = await prisma.user.create({
        data: {
          email,
          password: passwordHash,
          fullName: 'Simulation Test User',
          isActive: true,
          roleId: defaultRole!.id,
        },
      });
      testUserId = user.id;

      // Create test wallet
      await prisma.wallet.create({
        data: {
          userId: testUserId,
          name: 'Sim Main Wallet',
          currency: 'VND',
          balance: new Prisma.Decimal(30000000),
          isDefault: true,
        },
      });

      // Login
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email, password });

      authHeader = `Bearer ${loginRes.body.data.accessToken}`;
    });

    afterAll(async () => {
      await prisma.wallet.deleteMany({ where: { userId: testUserId } });
      await prisma.user.deleteMany({ where: { id: testUserId } });
    });

    it('GET /api/v1/simulations/presets should return default simulation templates', async () => {
      const res = await request(app)
        .get('/api/v1/simulations/presets')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });

    it('POST /api/v1/simulations/run should return comparative simulation metrics', async () => {
      const res = await request(app)
        .post('/api/v1/simulations/run')
        .set('Authorization', authHeader)
        .send({
          currency: 'VND',
          horizonMonths: 12,
          perturbations: [
            {
              type: 'RECURRING_EXPENSE',
              name: 'Car Installment',
              amount: '4000000.00',
              startMonth: 1,
              durationMonths: 12,
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.currency).toBe('VND');
      expect(res.body.data.monthlyComparison).toHaveLength(12);
      expect(res.body.data.summary).toBeDefined();
      expect(parseFloat(res.body.data.summary.netDelta)).toBeCloseTo(-48000000, 0);
    });
  });
});
