import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/database/prisma.client';
import bcrypt from 'bcryptjs';

describe('Debt Settlement & Atomic Split Integration Tests', () => {
  const testUser = {
    email: 'debt-settle-test@gmail.com',
    password: 'Password@123456',
    fullName: 'Debt Settlement User',
  };

  let userId = '';
  let accessToken = '';
  let walletId = '';
  let debtId = '';

  beforeAll(async () => {
    // 1. Setup user
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

    // 2. Login
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: testUser.email, password: testUser.password });

    accessToken = loginRes.body.data.accessToken;

    // 3. Create wallet with 100M VND
    const wallet = await prisma.wallet.create({
      data: {
        userId,
        name: 'Ví Thanh Toán Techcombank',
        balance: 100_000_000,
        currency: 'VND',
      },
    });
    walletId = wallet.id;

    // 4. Create a 12-month borrowing contract of 120M with 12%/year (1%/mo) reducing balance
    const debtRes = await request(app)
      .post('/api/v1/debts')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Vay ngân hàng mua nhà',
        counterparty: 'Techcombank',
        type: 'DEBT_PAYABLE',
        method: 'REDUCING_BALANCE',
        principal: 120_000_000,
        annualInterestRate: 12,
        termMonths: 12,
        startDate: '2026-10-01',
        walletId,
      });

    debtId = debtRes.body.data.id;
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { userId } });
    await prisma.debtScheduleItem.deleteMany({ where: { userId } });
    await prisma.debtContract.deleteMany({ where: { userId } });
    await prisma.category.deleteMany({ where: { userId } });
    await prisma.wallet.deleteMany({ where: { userId } });
    await prisma.refreshToken.deleteMany({ where: { userId } });
    await prisma.userDevice.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  describe('POST /api/v1/debts/:id/installments/:period/pay (Atomic Split Payment)', () => {
    it('should atomically pay installment: decrement wallet, decrease principal, and create interest P&L transaction', async () => {
      // Period 1: Gốc 10M, Lãi 1.2M, Tổng 11.2M
      const res = await request(app)
        .post(`/api/v1/debts/${debtId}/installments/1/pay`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          notes: 'Đã chuyển khoản qua app ngân hàng',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.installment.status).toBe('PAID');
      expect(Number(res.body.installment.principalPaid)).toBe(10_000_000);
      expect(Number(res.body.installment.interestPaid)).toBe(1_200_000);
      expect(res.body.settlementDetails.totalAmountPaid).toBe(11_200_000);

      // Verify Wallet Balance was decremented by EXACT totalDue (100M - 11.2M = 88.8M)
      const updatedWallet = await prisma.wallet.findUnique({ where: { id: walletId } });
      expect(Number(updatedWallet?.balance)).toBe(88_800_000);

      // Verify Contract remaining principal decreased by EXACT principal (120M - 10M = 110M)
      const updatedContract = await prisma.debtContract.findUnique({ where: { id: debtId } });
      expect(Number(updatedContract?.remainingPrincipal)).toBe(110_000_000);
      expect(updatedContract?.status).toBe('ACTIVE');

      // Verify Interest Transaction was created for 1.2M
      expect(res.body.settlementDetails.interestTransactionId).not.toBeNull();
      const interestTx = await prisma.transaction.findUnique({
        where: { id: res.body.settlementDetails.interestTransactionId },
        include: { category: true },
      });
      expect(interestTx).not.toBeNull();
      expect(Number(interestTx?.amount)).toBe(1_200_000);
      expect(interestTx?.type).toBe('EXPENSE');
      expect(interestTx?.category.name).toBe('Chi phí lãi vay');
    });

    it('should reject paying an already PAID installment (409 Conflict)', async () => {
      const res = await request(app)
        .post(`/api/v1/debts/${debtId}/installments/1/pay`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({});

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('DUPLICATE_ENTRY');
    });
  });

  describe('POST /api/v1/debts/:id/settle-early (Early Settlement)', () => {
    it('should settle full remaining debt early, waive future interest, and close contract', async () => {
      // Remaining principal is 110M. Let's add a penalty fee of 1M.
      // Total amount to pay: 110M + 1M = 111M.
      // But wallet only has 88.8M! Let's verify insufficient balance error first!
      const failRes = await request(app)
        .post(`/api/v1/debts/${debtId}/settle-early`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          penaltyFee: 1_000_000,
        });

      expect(failRes.status).toBe(400);
      expect(failRes.body.success).toBe(false);
      expect(failRes.body.code).toBe('INSUFFICIENT_BALANCE');

      // Now top-up wallet to 150M to have enough funds
      await prisma.wallet.update({
        where: { id: walletId },
        data: { balance: 150_000_000 },
      });

      // Settle early now
      const res = await request(app)
        .post(`/api/v1/debts/${debtId}/settle-early`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          penaltyFee: 1_000_000,
          notes: 'Tất toán trước hạn bằng tiền thưởng cuối năm',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.contract.status).toBe('COMPLETED');
      expect(Number(res.body.contract.remainingPrincipal)).toBe(0);
      expect(res.body.settlementDetails.principalSettled).toBe(110_000_000);
      expect(res.body.settlementDetails.penaltyFee).toBe(1_000_000);
      expect(res.body.settlementDetails.totalAmountPaid).toBe(111_000_000);

      // Verify wallet: 150M - 111M = 39M
      const finalWallet = await prisma.wallet.findUnique({ where: { id: walletId } });
      expect(Number(finalWallet?.balance)).toBe(39_000_000);

      // Verify all remaining schedule items (periods 2..12) are WAIVED
      const unpaidItems = await prisma.debtScheduleItem.findMany({
        where: { debtContractId: debtId, status: { notIn: ['PAID', 'WAIVED'] } },
      });
      expect(unpaidItems).toHaveLength(0);

      const waivedItems = await prisma.debtScheduleItem.findMany({
        where: { debtContractId: debtId, status: 'WAIVED' },
      });
      expect(waivedItems).toHaveLength(11);
    });
  });
});
