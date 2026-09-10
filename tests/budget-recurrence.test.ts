import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/database/prisma.client';
import bcrypt from 'bcryptjs';
import { BudgetService } from '../src/modules/budgets/budget.service';

describe('Budget Recurrence & Auto-Renewal Integration Tests', () => {
  const testUser = {
    email: 'budget-recurrence-test@gmail.com',
    password: 'Password@123456',
    fullName: 'Budget Recurrence Test User',
  };

  let userId = '';
  let accessToken = '';
  let walletId = '';
  let categoryId = '';
  const budgetService = new BudgetService();

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

    const wallet = await prisma.wallet.create({
      data: {
        userId,
        name: 'Ví Recurrence',
        balance: 10000000.0,
        currency: 'VND',
      },
    });
    walletId = wallet.id;

    const category = await prisma.category.create({
      data: {
        userId,
        name: 'Ăn uống Recurrence',
        type: 'EXPENSE',
      },
    });
    categoryId = category.id;

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: testUser.email, password: testUser.password });

    accessToken = loginRes.body.data.accessToken;
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId } });
    await prisma.transaction.deleteMany({ where: { userId } });
    await prisma.budget.deleteMany({ where: { userId } });
    await prisma.category.deleteMany({ where: { userId } });
    await prisma.wallet.deleteMany({ where: { userId } });
    await prisma.refreshToken.deleteMany({ where: { userId } });
    await prisma.userDevice.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  it('should create a recurring budget with recurrenceGroupId and autoRenew enabled', async () => {
    const res = await request(app)
      .post('/api/v1/budgets')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Ngân sách ăn uống tháng 8',
        amount: '3000000.00',
        currency: 'VND',
        type: 'CATEGORY',
        period: 'MONTHLY',
        categoryId,
        startDate: '2026-08-01',
        alertThreshold: '80.00',
        isRecurring: true,
        autoRenew: true,
        rolloverMode: 'RESET',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.isRecurring).toBe(true);
    expect(res.body.data.autoRenew).toBe(true);
    expect(res.body.data.recurrenceGroupId).toBeTruthy();
    expect(res.body.data.rolloverMode).toBe('RESET');
    expect(res.body.data.startDate).toBe('2026-08-01');
    expect(res.body.data.endDate).toBe('2026-08-31');
  });

  it('should auto-renew an ended August budget into September when processed', async () => {
    // 1. Create recurring August budget
    const createRes = await request(app)
      .post('/api/v1/budgets')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Ăn uống hàng tháng',
        amount: '5000000.00',
        currency: 'VND',
        type: 'CATEGORY',
        period: 'MONTHLY',
        categoryId,
        startDate: '2026-08-01',
        isRecurring: true,
        autoRenew: true,
        rolloverMode: 'RESET',
      });
    expect(createRes.status).toBe(201);
    const parentId = createRes.body.data.id;
    const recurrenceGroupId = createRes.body.data.recurrenceGroupId;

    // 2. Spend 1.5M in August
    await request(app)
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        walletId,
        categoryId,
        type: 'EXPENSE',
        amount: '1500000.00',
        date: '2026-08-10',
        note: 'Ăn tối',
      });

    // 3. Trigger renewal as if current date is 2026-09-10
    const testNow = new Date('2026-09-10T12:00:00+07:00');
    const renewedCount = await budgetService.processDueRenewals(testNow);
    expect(renewedCount).toBeGreaterThanOrEqual(1);

    // 4. Verify September budget is created
    const seriesRes = await request(app)
      .get(`/api/v1/budgets/${parentId}/series`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(seriesRes.status).toBe(200);
    const series = seriesRes.body.data;
    expect(series.length).toBe(2);

    const septemberBudget = series.find((b: any) => b.startDate === '2026-09-01');
    expect(septemberBudget).toBeDefined();
    expect(septemberBudget.endDate).toBe('2026-09-30');
    expect(septemberBudget.amount).toBe('5000000.00');
    expect(septemberBudget.recurrenceGroupId).toBe(recurrenceGroupId);
    expect(septemberBudget.parentBudgetId).toBe(parentId);

    // 5. Verify parent has renewedAt set
    const parentBudget = await prisma.budget.findUnique({ where: { id: parentId } });
    expect(parentBudget?.renewedAt).not.toBeNull();
  });

  it('should correctly calculate rollover surplus in ROLLOVER_SURPLUS mode', async () => {
    // Create dedicated category for pocket money
    const pocketCategory = await prisma.category.create({
      data: {
        userId,
        name: 'Tiêu vặt Rollover Category',
        type: 'EXPENSE',
      },
    });

    // 1. Create parent budget with 2M limit and ROLLOVER_SURPLUS
    const createRes = await request(app)
      .post('/api/v1/budgets')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Tiêu vặt tháng 8',
        amount: '2000000.00',
        currency: 'VND',
        type: 'CATEGORY',
        period: 'MONTHLY',
        categoryId: pocketCategory.id,
        startDate: '2026-08-01',
        isRecurring: true,
        autoRenew: true,
        rolloverMode: 'ROLLOVER_SURPLUS',
      });
    expect(createRes.status).toBe(201);
    const parentId = createRes.body.data.id;

    // 2. Spend 500k in August -> Surplus = +1,500,000
    await request(app)
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        walletId,
        categoryId: pocketCategory.id,
        type: 'EXPENSE',
        amount: '500000.00',
        date: '2026-08-20',
        note: 'Mua sách',
      });

    // 3. Trigger renewal for September
    const testNow = new Date('2026-09-10T12:00:00+07:00');
    await budgetService.processDueRenewals(testNow);

    // 4. Verify September budget has 2M + 1.5M = 3.5M
    const seriesRes = await request(app)
      .get(`/api/v1/budgets/${parentId}/series`)
      .set('Authorization', `Bearer ${accessToken}`);

    const septemberBudget = seriesRes.body.data.find((b: any) => b.startDate === '2026-09-01');
    expect(septemberBudget).toBeDefined();
    expect(septemberBudget.amount).toBe('3500000.00');
    expect(septemberBudget.rolloverAmount).toBe('1500000.00');
    expect(septemberBudget.name).toBe('Tiêu vặt tháng 9');
  });

  it('should support toggleAutoRenew to pause and resume auto-renew', async () => {
    const createRes = await request(app)
      .post('/api/v1/budgets')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Ngân sách tạm dừng',
        amount: '1000000.00',
        currency: 'VND',
        type: 'CATEGORY',
        period: 'MONTHLY',
        categoryId,
        startDate: '2026-09-01',
        isRecurring: true,
        autoRenew: true,
      });
    expect(createRes.status).toBe(201);
    const id = createRes.body.data.id;

    // Pause auto-renew
    const pauseRes = await request(app)
      .patch(`/api/v1/budgets/${id}/auto-renew`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ autoRenew: false });

    expect(pauseRes.status).toBe(200);
    expect(pauseRes.body.data.autoRenew).toBe(false);

    // Resume auto-renew
    const resumeRes = await request(app)
      .patch(`/api/v1/budgets/${id}/auto-renew`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ autoRenew: true });

    expect(resumeRes.status).toBe(200);
    expect(resumeRes.body.data.autoRenew).toBe(true);
  });
});
