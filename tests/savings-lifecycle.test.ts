import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/database/prisma.client';
import bcrypt from 'bcryptjs';

describe('Savings Module Lifecycle & Financial Integrity Integration Tests', () => {
  const testUser = {
    email: 'savings-test@gmail.com',
    password: 'Password@123456',
    fullName: 'Savings Test User',
  };

  let userId = '';
  let accessToken = '';
  let sourceWalletId = '';
  let categoryId = '';
  let termDepositId = '';
  let savingsWalletId = '';
  let attackerUserId = '';
  let attackerWalletId = '';

  beforeAll(async () => {
    // 1. Setup test user
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

    // 2. Setup attacker user for BOLA/IDOR isolation testing
    const attackerUser = await prisma.user.create({
      data: {
        email: 'savings-attacker@gmail.com',
        password: passwordHash,
        fullName: 'Attacker User',
        roleId: defaultRole!.id,
        isActive: true,
      },
    });
    attackerUserId = attackerUser.id;

    const attackerWallet = await prisma.wallet.create({
      data: {
        userId: attackerUserId,
        name: 'Ví Kẻ Tấn Công',
        balance: 10_000,
        currency: 'VND',
        type: 'STANDARD',
      },
    });
    attackerWalletId = attackerWallet.id;

    // 3. Login to get token
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: testUser.email, password: testUser.password });

    accessToken = loginRes.body.data.accessToken;

    // 4. Create a source liquid wallet with 100,000,000 VND
    const wallet = await prisma.wallet.create({
      data: {
        userId,
        name: 'Ví Thanh Toán VCB',
        balance: 100_000_000,
        currency: 'VND',
        type: 'STANDARD',
      },
    });
    sourceWalletId = wallet.id;

    // 5. Create an EXPENSE category for spending test
    const category = await prisma.category.create({
      data: {
        userId,
        name: 'Ăn uống',
        type: 'EXPENSE',
      },
    });
    categoryId = category.id;
  });

  afterAll(async () => {
    await prisma.termDepositRolloverLog.deleteMany({
      where: { termDeposit: { userId } },
    });
    await prisma.termDeposit.deleteMany({ where: { userId } });
    await prisma.transaction.deleteMany({ where: { userId } });
    await prisma.transfer.deleteMany({ where: { userId } });
    await prisma.category.deleteMany({ where: { userId } });
    await prisma.wallet.deleteMany({ where: { userId } });
    await prisma.refreshToken.deleteMany({ where: { userId } });
    await prisma.userDevice.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });

    // Clean up attacker data
    await prisma.wallet.deleteMany({ where: { userId: attackerUserId } });
    await prisma.user.deleteMany({ where: { id: attackerUserId } });
  });

  it('1. POST /api/v1/savings/preview - should calculate live preview without DB side-effects', async () => {
    const res = await request(app)
      .post('/api/v1/savings/preview')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        principalAmount: '40000000',
        interestRate: '5.5',
        termMonths: 6,
        startDate: '2026-01-15',
      });

    expect(res.status).toBe(200);
    expect(res.body.principalAmount).toBe('40000000.00');
    expect(res.body.termMonths).toBe(6);
    expect(res.body.startDate).toBe('2026-01-15');
    expect(res.body.maturityDate).toBe('2026-07-15');
    expect(res.body.actualDays).toBe(181);
    expect(res.body.estimatedInterest).toBe('1090958.90'); // (40M * 0.055 * 181) / 365
    expect(res.body.totalAtMaturity).toBe('41090958.90');
  });

  it('2. POST /api/v1/savings - should open a new term deposit deducted from source wallet', async () => {
    const res = await request(app)
      .post('/api/v1/savings')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Sổ Tiết Kiệm VCB 6T',
        bankName: 'Vietcombank',
        accountNumber: 'STK-99887766',
        principalAmount: '40000000',
        interestRate: '5.5',
        termMonths: 6,
        startDate: '2026-01-15',
        rolloverMethod: 'ROLLOVER_ALL',
        sourceWalletId,
        targetWalletId: sourceWalletId,
        color: '#10B981',
      });

    expect(res.status).toBe(201);
    expect(res.body.bankName).toBe('Vietcombank');
    expect(res.body.principalAmount).toBe('40000000.00');
    expect(res.body.status).toBe('ACTIVE');
    expect(res.body.rolloverMethod).toBe('ROLLOVER_ALL');

    termDepositId = res.body.id;
    savingsWalletId = res.body.walletId;

    // Verify source wallet balance was deducted by 40M (from 100M to 60M)
    const updatedSource = await prisma.wallet.findUnique({ where: { id: sourceWalletId } });
    expect(Number(updatedSource!.balance)).toBe(60_000_000);

    // Verify savings wallet was created with balance 40M and type SAVINGS_ACCOUNT
    const savingsWallet = await prisma.wallet.findUnique({ where: { id: savingsWalletId } });
    expect(Number(savingsWallet!.balance)).toBe(40_000_000);
    expect(savingsWallet!.type).toBe('SAVINGS_ACCOUNT');

    // Verify transfer record was created (not an expense)
    const transfer = await prisma.transfer.findFirst({
      where: { sourceWalletId, destinationWalletId: savingsWalletId },
    });
    expect(transfer).not.toBeNull();
    expect(Number(transfer!.amount)).toBe(40_000_000);
  });

  it('3. POST /api/v1/transactions - should block EXPENSE directly on SAVINGS_ACCOUNT wallet', async () => {
    const res = await request(app)
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        walletId: savingsWalletId,
        categoryId,
        amount: '100000',
        type: 'EXPENSE',
        date: '2026-02-01',
        description: 'Cố tình chi tiêu từ sổ tiết kiệm',
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('WALLET_SAVINGS_LOCKED');

    // Balance must remain strictly unchanged
    const savingsWallet = await prisma.wallet.findUnique({ where: { id: savingsWalletId } });
    expect(Number(savingsWallet!.balance)).toBe(40_000_000);
  });

  it('3b. POST /api/v1/transfers - should block TRANSFER OUT of SAVINGS_ACCOUNT wallet', async () => {
    const res = await request(app)
      .post('/api/v1/transfers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        sourceWalletId: savingsWalletId,
        destinationWalletId: sourceWalletId,
        amount: '5000000',
        transferredAt: '2026-02-01',
        note: 'Cố tình chuyển tiền từ sổ tiết kiệm',
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('WALLET_SAVINGS_LOCKED');
  });

  it('3c. PATCH /api/v1/wallets/:id/default - should block setting SAVINGS_ACCOUNT as default wallet', async () => {
    const res = await request(app)
      .patch(`/api/v1/wallets/${savingsWalletId}/default`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('WALLET_SAVINGS_LOCKED');
  });

  it('3d. DELETE /api/v1/wallets/:id - should block archiving SAVINGS_ACCOUNT wallet directly', async () => {
    const res = await request(app)
      .delete(`/api/v1/wallets/${savingsWalletId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('WALLET_SAVINGS_LOCKED');
  });

  it('3e. POST /api/v1/savings - should reject create when rolloverMethod requires targetWalletId but none provided', async () => {
    const res = await request(app)
      .post('/api/v1/savings')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Sổ Lỗi Thiếu Ví Nhận',
        bankName: 'Techcombank',
        principalAmount: '10000000',
        interestRate: '5.0',
        termMonths: 3,
        rolloverMethod: 'ROLLOVER_PRINCIPAL',
      });

    expect(res.status).toBe(422);
  });

  it('3f. GET /api/v1/savings/:id - should reject non-UUID params with 422', async () => {
    const res = await request(app)
      .get('/api/v1/savings/invalid-uuid-format')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(422);
  });

  it('4. GET /api/v1/savings - should list active deposits with calculated accrued interest', async () => {
    const res = await request(app)
      .get('/api/v1/savings')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.summary.activeCount).toBe(1);
    expect(Number(res.body.summary.totalPrincipal)).toBe(40_000_000);
    expect(res.body.data[0].accrued).toBeDefined();
    expect(res.body.data[0].accrued.totalDays).toBe(181);
  });

  it('5. PUT /api/v1/savings/:id - should update rollover method and bank notes', async () => {
    const res = await request(app)
      .put(`/api/v1/savings/${termDepositId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        rolloverMethod: 'SETTLE_TO_WALLET',
        targetWalletId: sourceWalletId,
        notes: 'Chuyển phương thức sang tất toán về ví chính khi đến hạn',
      });

    expect(res.status).toBe(200);
    expect(res.body.rolloverMethod).toBe('SETTLE_TO_WALLET');
    expect(res.body.notes).toContain('Chuyển phương thức sang tất toán');
  });

  it('5b. POST /api/v1/savings/:id/settle - should block settle into another user wallet (BOLA / IDOR protection)', async () => {
    const res = await request(app)
      .post(`/api/v1/savings/${termDepositId}/settle`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        targetWalletId: attackerWalletId,
        isEarlyWithdrawal: false,
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('5c. POST /api/v1/savings/:id/settle - should block settle into the deposit own savings wallet', async () => {
    const res = await request(app)
      .post(`/api/v1/savings/${termDepositId}/settle`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        targetWalletId: savingsWalletId,
        isEarlyWithdrawal: false,
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('6. POST /api/v1/savings/:id/settle - should settle principal and interest into target wallet', async () => {
    const res = await request(app)
      .post(`/api/v1/savings/${termDepositId}/settle`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        targetWalletId: sourceWalletId,
        isEarlyWithdrawal: false,
        notes: 'Xác nhận tất toán đúng hạn',
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('SETTLED');
    expect(Number(res.body.actualInterest)).toBeGreaterThan(0);

    // Verify savings wallet balance is 0 and isArchived is true
    const savingsWallet = await prisma.wallet.findUnique({ where: { id: savingsWalletId } });
    expect(Number(savingsWallet!.balance)).toBe(0);
    expect(savingsWallet!.isArchived).toBe(true);

    // Verify target wallet received principal + interest
    const updatedSource = await prisma.wallet.findUnique({ where: { id: sourceWalletId } });
    // Previous source balance was 60M, now receives 40M + estimatedInterest (1,090,958.90) = 101,090,958.90
    expect(Number(updatedSource!.balance)).toBeCloseTo(101_090_958.90, 1);

    // Verify income transaction for interest was generated
    const interestTx = await prisma.transaction.findFirst({
      where: {
        userId,
        walletId: sourceWalletId,
        type: 'INCOME',
      },
    });
    expect(interestTx).not.toBeNull();
    expect(Number(interestTx!.amount)).toBeCloseTo(1_090_958.90, 1);
  });
});
