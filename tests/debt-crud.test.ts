import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/database/prisma.client';
import bcrypt from 'bcryptjs';

describe('Debt Module CRUD & Preview Integration Tests', () => {
  const testUser = {
    email: 'debt-test@gmail.com',
    password: 'Password@123456',
    fullName: 'Debt Test User',
  };

  let userId = '';
  let accessToken = '';
  let walletId = '';
  let debtId = '';

  beforeAll(async () => {
    // 1. Setup test user with USER role
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

    // 2. Login to obtain access token
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: testUser.email, password: testUser.password });

    accessToken = loginRes.body.data.accessToken;

    // 3. Create a test wallet
    const wallet = await prisma.wallet.create({
      data: {
        userId,
        name: 'Ví Techcombank Test',
        balance: 50_000_000,
        currency: 'VND',
      },
    });
    walletId = wallet.id;
  });

  afterAll(async () => {
    await prisma.debtScheduleItem.deleteMany({ where: { userId } });
    await prisma.debtContract.deleteMany({ where: { userId } });
    await prisma.wallet.deleteMany({ where: { userId } });
    await prisma.refreshToken.deleteMany({ where: { userId } });
    await prisma.userDevice.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  describe('POST /api/v1/debts/preview', () => {
    it('should generate amortization schedule preview without persisting to DB', async () => {
      const res = await request(app)
        .post('/api/v1/debts/preview')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          principal: 60_000_000,
          annualInterestRate: 12,
          termMonths: 6,
          startDate: '2026-10-01',
          method: 'REDUCING_BALANCE',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.method).toBe('REDUCING_BALANCE');
      expect(res.body.data.installments).toHaveLength(6);
      expect(res.body.data.summary.principal).toBe(60_000_000);
      expect(res.body.data.summary.totalInterest).toBe(2_100_000);

      // Verify no records created in DB
      const dbCount = await prisma.debtContract.count({ where: { userId } });
      expect(dbCount).toBe(0);
    });

    it('should return 400 validation error on invalid input', async () => {
      const res = await request(app)
        .post('/api/v1/debts/preview')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          principal: -1000,
          annualInterestRate: 12,
          termMonths: 6,
          startDate: 'invalid-date',
          method: 'REDUCING_BALANCE',
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/v1/debts (Create Debt Contract & Schedule)', () => {
    it('should create debt contract and auto-generate schedule items in DB', async () => {
      const res = await request(app)
        .post('/api/v1/debts')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Vay mua xe Mazda 3',
          counterparty: 'Ngân hàng Techcombank',
          type: 'DEBT_PAYABLE',
          method: 'REDUCING_BALANCE',
          principal: 120_000_000,
          annualInterestRate: 12,
          termMonths: 12,
          startDate: '2026-10-01',
          walletId,
          notes: 'Gói vay trả góp mua ô tô ưu đãi',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Vay mua xe Mazda 3');
      expect(res.body.data.counterparty).toBe('Ngân hàng Techcombank');
      expect(res.body.data.type).toBe('DEBT_PAYABLE');
      expect(res.body.data.method).toBe('REDUCING_BALANCE');
      expect(res.body.data.scheduleItems).toHaveLength(12);

      debtId = res.body.data.id;

      // Verify directly in DB
      const dbContract = await prisma.debtContract.findUnique({
        where: { id: debtId },
        include: { scheduleItems: true },
      });
      expect(dbContract).not.toBeNull();
      expect(dbContract?.scheduleItems).toHaveLength(12);
      expect(Number(dbContract?.remainingPrincipal)).toBe(120_000_000);
    });
  });

  describe('GET /api/v1/debts (List Debts)', () => {
    it('should list debt contracts with pagination and summary', async () => {
      const res = await request(app)
        .get('/api/v1/debts')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.pagination.total).toBe(1);
      expect(res.body.summary.totalBorrowing).toBe(120_000_000);
      expect(res.body.summary.totalLending).toBe(0);
    });
  });

  describe('GET /api/v1/debts/:id (Detail & Metrics)', () => {
    it('should return debt details with progress metrics', async () => {
      const res = await request(app)
        .get(`/api/v1/debts/${debtId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(debtId);
      expect(res.body.data.metrics.totalInstallments).toBe(12);
      expect(res.body.data.metrics.paidInstallments).toBe(0);
      expect(res.body.data.metrics.progressPercent).toBe(0);
      expect(res.body.data.metrics.remainingPrincipal).toBe(120_000_000);
    });
  });

  describe('PUT /api/v1/debts/:id (Update Metadata)', () => {
    it('should update debt contract metadata', async () => {
      const res = await request(app)
        .put(`/api/v1/debts/${debtId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Vay mua xe Mazda 3 Luxury',
          notes: 'Đã cập nhật hợp đồng bảo hiểm xe',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Vay mua xe Mazda 3 Luxury');
      expect(res.body.data.notes).toBe('Đã cập nhật hợp đồng bảo hiểm xe');
    });
  });

  describe('DELETE /api/v1/debts/:id (Archive Debt)', () => {
    it('should archive debt contract', async () => {
      const res = await request(app)
        .delete(`/api/v1/debts/${debtId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify archived in DB
      const dbContract = await prisma.debtContract.findUnique({
        where: { id: debtId },
      });
      expect(dbContract?.isArchived).toBe(true);
      expect(dbContract?.status).toBe('CANCELLED');
    });
  });
});
