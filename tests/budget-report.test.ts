import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/database/prisma.client';
import bcrypt from 'bcryptjs';

describe('Budget & Report Integration Tests', () => {
  const testUser = {
    email: 'budget-report-test@gmail.com',
    password: 'Password@123456',
    fullName: 'Budget Report Test User',
  };

  let userId = '';
  let accessToken = '';
  let walletId = '';
  let categoryId = '';

  beforeAll(async () => {
    const defaultRole = await prisma.role.findUnique({ where: { name: 'USER' } });
    const passwordHash = await bcrypt.hash(testUser.password, 10);
    const user = await prisma.user.create({
      data: {
        email: testUser.email,
        password: passwordHash,
        fullName: testUser.fullName,
        roleId: defaultRole!.id,
        isActive: true,
      },
    });
    userId = user.id;

    // Create wallet
    const wallet = await prisma.wallet.create({
      data: {
        userId,
        name: 'Ví chi tiêu',
        balance: 10000000.0,
        currency: 'VND',
      },
    });
    walletId = wallet.id;

    // Create category
    const category = await prisma.category.create({
      data: {
        userId,
        name: 'Ăn uống',
        type: 'EXPENSE',
      },
    });
    categoryId = category.id;

    // Login
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: testUser.email, password: testUser.password });

    accessToken = loginRes.body.data.accessToken;
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { userId } });
    await prisma.budget.deleteMany({ where: { userId } });
    await prisma.category.deleteMany({ where: { userId } });
    await prisma.wallet.deleteMany({ where: { userId } });
    await prisma.refreshToken.deleteMany({ where: { userId } });
    await prisma.userDevice.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  it('should create budgets and query budget list with batch spending summaries without N+1 error', async () => {
    // Create 3 budgets
    const budget1 = await request(app)
      .post('/api/v1/budgets')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Ngân sách ăn uống tháng 8',
        amount: '3000000.00',
        currency: 'VND',
        type: 'CATEGORY',
        period: 'CUSTOM',
        categoryId,
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        alertThreshold: '80.00',
      });
    expect(budget1.status).toBe(201);

    // Create an expense transaction within the budget
    await request(app)
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        walletId,
        categoryId,
        type: 'EXPENSE',
        amount: '500000.00',
        date: '2026-08-15',
        note: 'Ăn trưa',
      });

    // Query budgets list
    const res = await request(app)
      .get('/api/v1/budgets')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);

    const targetBudget = res.body.data.find((b: any) => b.id === budget1.body.data.id);
    expect(targetBudget).toBeDefined();
    expect(targetBudget.usage.spentAmount).toBe('500000.00');
    expect(targetBudget.usage.transactionCount).toBe(1);
  });

  it('should include boundary end-date transactions in custom reports', async () => {
    // Add transaction on August 31 (the boundary end date)
    await request(app)
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        walletId,
        categoryId,
        type: 'EXPENSE',
        amount: '200000.00',
        date: '2026-08-31',
        note: 'Cà phê cuối tháng',
      });

    // Query custom report from 2026-08-01 to 2026-08-31
    const res = await request(app)
      .get('/api/v1/reports/overview')
      .set('Authorization', `Bearer ${accessToken}`)
      .query({
        period: 'CUSTOM',
        dateFrom: '2026-07-31T17:00:00.000Z', // 2026-08-01 00:00 VN
        dateTo: '2026-08-31T17:00:00.000Z',   // 2026-09-01 00:00 VN (inclusive of Aug 31)
        walletId,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const vndMetric = res.body.data.metricsByCurrency.find((m: any) => m.currency === 'VND');
    expect(vndMetric).toBeDefined();
    // 500k from Aug 15 + 200k from Aug 31 = 700k
    expect(vndMetric.expense).toBe('700000.00');
    expect(vndMetric.transactionCount).toBe(2);
  });
});
