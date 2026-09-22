import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/database/prisma.client';
import bcrypt from 'bcryptjs';

describe('Real-time Token Handover via QR & OTP Integration Tests', () => {
  const userAData = {
    email: 'handover-user-a@gmail.com',
    password: 'Password@123456',
    fullName: 'Nguyễn Văn A (Cũ)',
  };

  const userBData = {
    email: 'handover-user-b@gmail.com',
    password: 'Password@123456',
    fullName: 'Trần Thị B (Mới)',
  };

  let tokenA = '';
  let tokenB = '';
  let userAId = '';
  let userBId = '';

  let activeHandoverToken = '';
  let activePinCode = '';

  beforeAll(async () => {
    const defaultRole = await prisma.role.findUnique({ where: { name: 'USER' } });
    const passwordHash = await bcrypt.hash('Password@123456', 10);

    // Tạo User A (Bên chuyển)
    const createdA = await prisma.user.create({
      data: {
        email: userAData.email,
        password: passwordHash,
        fullName: userAData.fullName,
        roleId: defaultRole!.id,
        isActive: true,
      },
    });
    userAId = createdA.id;

    // Tạo User B (Bên nhận)
    const createdB = await prisma.user.create({
      data: {
        email: userBData.email,
        password: passwordHash,
        fullName: userBData.fullName,
        roleId: defaultRole!.id,
        isActive: true,
      },
    });
    userBId = createdB.id;

    // Đăng nhập lấy access tokens
    const loginA = await request(app).post('/api/v1/auth/login').send({
      email: userAData.email,
      password: userAData.password,
    });
    tokenA = loginA.body.data.accessToken;

    const loginB = await request(app).post('/api/v1/auth/login').send({
      email: userBData.email,
      password: userBData.password,
    });
    tokenB = loginB.body.data.accessToken;

    // Tạo dữ liệu tài chính cho User A: 2 ví, 2 danh mục, 3 giao dịch, 1 chuyển tiền, 1 ngân sách, 1 mục tiêu
    const wallet1A = await prisma.wallet.create({
      data: {
        userId: userAId,
        name: 'Tiền mặt',
        balance: 3000000.0,
        currency: 'VND',
        isDefault: true,
      },
    });

    const wallet2A = await prisma.wallet.create({
      data: {
        userId: userAId,
        name: 'Ngân hàng VCB',
        balance: 10000000.0,
        currency: 'VND',
        isDefault: false,
      },
    });

    const category1A = await prisma.category.create({
      data: {
        userId: userAId,
        name: 'Ăn uống',
        type: 'EXPENSE',
        isSystem: false,
      },
    });

    const category2A = await prisma.category.create({
      data: {
        userId: userAId,
        name: 'Lương thưởng',
        type: 'INCOME',
        isSystem: false,
      },
    });

    await prisma.transaction.create({
      data: {
        userId: userAId,
        walletId: wallet1A.id,
        categoryId: category1A.id,
        amount: 80000.0,
        type: 'EXPENSE',
        description: 'Bún chả trưa',
        date: new Date('2026-09-10'),
      },
    });

    await prisma.transaction.create({
      data: {
        userId: userAId,
        walletId: wallet2A.id,
        categoryId: category2A.id,
        amount: 15000000.0,
        type: 'INCOME',
        description: 'Lương tháng 9',
        date: new Date('2026-09-05'),
      },
    });

    await prisma.transfer.create({
      data: {
        userId: userAId,
        sourceWalletId: wallet2A.id,
        destinationWalletId: wallet1A.id,
        amount: 2000000.0,
        note: 'Rút ATM',
        transferredAt: new Date('2026-09-08'),
      },
    });

    await prisma.budget.create({
      data: {
        userId: userAId,
        name: 'Ngân sách ăn uống',
        amount: 5000000.0,
        currency: 'VND',
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-09-30'),
        categoryId: category1A.id,
      },
    });

    await prisma.savingGoal.create({
      data: {
        userId: userAId,
        name: 'Quỹ khẩn cấp A',
        targetAmount: 20000000.0,
        currency: 'VND',
        targetDate: new Date('2026-12-31'),
      },
    });

    // Tạo dữ liệu có sẵn cho User B: 1 ví trùng tên ("Tiền mặt") và 1 danh mục trùng tên ("Ăn uống")
    // Để kiểm thử khả năng hòa hợp (harmonization & conflict resolution)
    await prisma.wallet.create({
      data: {
        userId: userBId,
        name: 'Tiền mặt',
        balance: 500000.0,
        currency: 'VND',
        isDefault: true,
      },
    });

    await prisma.category.create({
      data: {
        userId: userBId,
        name: 'Ăn uống',
        type: 'EXPENSE',
        isSystem: false,
      },
    });
  });

  afterAll(async () => {
    // Dọn dẹp dữ liệu kiểm thử
    await prisma.auditLog.deleteMany({
      where: {
        OR: [{ actorId: userAId }, { actorId: userBId }, { targetId: userBId }, { targetId: userAId }],
      },
    });
    await prisma.savingGoal.deleteMany({ where: { userId: { in: [userAId, userBId] } } });
    await prisma.budget.deleteMany({ where: { userId: { in: [userAId, userBId] } } });
    await prisma.transaction.deleteMany({ where: { userId: { in: [userAId, userBId] } } });
    await prisma.transfer.deleteMany({ where: { userId: { in: [userAId, userBId] } } });
    await prisma.wallet.deleteMany({ where: { userId: { in: [userAId, userBId] } } });
    await prisma.category.deleteMany({ where: { userId: { in: [userAId, userBId] } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: [userAId, userBId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
  });

  describe('1. Initiate Handover (User A)', () => {
    it('should generate handover token, 6-digit PIN, and QR Data URL', async () => {
      const res = await request(app)
        .post('/api/v1/handover/initiate')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.handoverToken).toBeDefined();
      expect(res.body.data.signature).toBeDefined();
      expect(res.body.data.pinCode).toMatch(/^[0-9]{6}$/);
      expect(res.body.data.expiresIn).toBe(900);
      expect(res.body.data.qrPayload).toContain('finwise://handover?token=');
      expect(res.body.data.qrDataUrl).toMatch(/^data:image\/png;base64,/);

      activeHandoverToken = res.body.data.handoverToken;
      activePinCode = res.body.data.pinCode;
    });

    it('should return PENDING_CLAIM when querying handover status', async () => {
      const res = await request(app)
        .get('/api/v1/handover/status')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('PENDING_CLAIM');
      expect(res.body.data.handoverToken).toBe(activeHandoverToken);
      expect(res.body.data.pinCode).toBe(activePinCode);
      expect(res.body.data.expiresIn).toBeGreaterThan(850);
    });
  });

  describe('2. Security & Anti-Brute-Force Checks', () => {
    it('should reject self-claim when User A tries to claim their own handover', async () => {
      const res = await request(app)
        .post('/api/v1/handover/claim')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ pinCode: activePinCode });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('HANDOVER_SAME_ACCOUNT');
    });

    it('should reject invalid PIN code', async () => {
      const res = await request(app)
        .post('/api/v1/handover/claim')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ handoverToken: activeHandoverToken, pinCode: '000000' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('HANDOVER_PIN_INVALID');
    });

    it('should lock and delete session after 5 consecutive failed PIN attempts', async () => {
      // Đã thử 1 lần ở test trên, thử tiếp 3 lần nữa
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post('/api/v1/handover/claim')
          .set('Authorization', `Bearer ${tokenB}`)
          .send({ handoverToken: activeHandoverToken, pinCode: '000000' });
      }

      // Lần thứ 5 sẽ bị khóa với mã lỗi HANDOVER_MAX_ATTEMPTS_EXCEEDED
      const lockedRes = await request(app)
        .post('/api/v1/handover/claim')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ handoverToken: activeHandoverToken, pinCode: '000000' });

      expect(lockedRes.status).toBe(429);
      expect(lockedRes.body.code).toBe('HANDOVER_MAX_ATTEMPTS_EXCEEDED');

      // Xác nhận phiên đã bị hủy trên hệ thống
      const statusRes = await request(app)
        .get('/api/v1/handover/status')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(statusRes.status).toBe(404);
    });
  });

  describe('3. Two-Party Handshake: Claim & Mutual OTP Authorization', () => {
    let freshToken = '';
    let freshPin = '';
    let otpCode = '';

    it('should re-initiate a fresh handover session', async () => {
      const res = await request(app)
        .post('/api/v1/handover/initiate')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(201);
      freshToken = res.body.data.handoverToken;
      freshPin = res.body.data.pinCode;
    });

    it('should allow User B to claim handover via valid 6-digit PIN', async () => {
      const res = await request(app)
        .post('/api/v1/handover/claim')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ pinCode: freshPin });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('CLAIMED');
      expect(res.body.data.sourceUserName).toBe(userAData.fullName);
    });

    it('should update status on User A side to CLAIMED with target user name and OTP prompt', async () => {
      const res = await request(app)
        .get('/api/v1/handover/status')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('CLAIMED');
      expect(res.body.data.targetUserName).toBe(userBData.fullName);
      expect(res.body.data.otpPrompt).toContain(userBData.fullName);
      expect(res.body.data.otpCodeDev).toBeDefined();

      otpCode = res.body.data.otpCodeDev;
    });

    it('should reject confirmation with invalid OTP', async () => {
      const res = await request(app)
        .post('/api/v1/handover/confirm')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ handoverToken: freshToken, otp: '999999' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('HANDOVER_OTP_INVALID');
    });

    it('should successfully execute atomic handover when User A confirms with correct OTP', async () => {
      const startTime = Date.now();

      const res = await request(app)
        .post('/api/v1/handover/confirm')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ handoverToken: freshToken, otp: otpCode });

      const durationMs = Date.now() - startTime;

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('COMPLETED');
      expect(res.body.data.targetUserId).toBe(userBId);
      expect(res.body.data.transferredRecords.transactions).toBe(2);
      expect(res.body.data.transferredRecords.transfers).toBe(1);
      expect(res.body.data.transferredRecords.budgets).toBe(1);
      expect(res.body.data.transferredRecords.savingGoals).toBe(1);

      // Tiêu chí nghiệm thu: xử lý database dưới 2 giây
      expect(durationMs).toBeLessThan(2000);
    });

    it('should verify 100% data integrity transferred to User B in database', async () => {
      // 1. Kiểm tra transactions: tất cả 2 transactions giờ thuộc về User B
      const userBTransactions = await prisma.transaction.findMany({
        where: { userId: userBId },
      });
      expect(userBTransactions.length).toBe(2);

      // User A không còn transaction nào
      const userATransactions = await prisma.transaction.findMany({
        where: { userId: userAId },
      });
      expect(userATransactions.length).toBe(0);

      // 2. Kiểm tra ví: Ví "Tiền mặt" của User A được đổi tên an toàn thành "Tiền mặt (Từ TK cũ)"
      const userBWallets = await prisma.wallet.findMany({
        where: { userId: userBId },
      });
      const walletNames = userBWallets.map((w) => w.name);
      expect(walletNames).toContain('Tiền mặt');
      expect(walletNames).toContain('Tiền mặt (Từ TK cũ)');
      expect(walletNames).toContain('Ngân hàng VCB');

      // 3. Kiểm tra danh mục: Danh mục "Ăn uống" của User A đã được hòa hợp vào danh mục User B
      const userBCategories = await prisma.category.findMany({
        where: { userId: userBId },
      });
      const categoryNames = userBCategories.map((c) => c.name);
      expect(categoryNames).toContain('Ăn uống');
      expect(categoryNames).toContain('Lương thưởng');

      // 4. Kiểm tra ngân sách & mục tiêu tiết kiệm
      const userBBudgets = await prisma.budget.findMany({ where: { userId: userBId } });
      expect(userBBudgets.length).toBe(1);

      const userBGoals = await prisma.savingGoal.findMany({ where: { userId: userBId } });
      expect(userBGoals.length).toBe(1);
    });

    it('should decommission User A: account is inactive and subsequent API requests are rejected (403)', async () => {
      const userAInDb = await prisma.user.findUnique({
        where: { id: userAId },
      });
      expect(userAInDb?.isActive).toBe(false);
      expect(userAInDb?.deletedAt).not.toBeNull();

      // Thử dùng access token của User A để gọi API
      const testReq = await request(app)
        .get('/api/v1/wallets')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(testReq.status).toBe(403);
      expect(testReq.body.code).toBe('USER_INACTIVE');
    });

    it('should allow User B to fetch handover result summary', async () => {
      const res = await request(app)
        .get(`/api/v1/handover/result/${freshToken}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('COMPLETED');
      expect(res.body.data.sourceUserName).toBe(userAData.fullName);
      expect(res.body.data.transferredRecords.transactions).toBe(2);
      expect(res.body.data.transferredRecords.transfers).toBe(1);
    });

    it('should verify AuditLog trail entries for all handover lifecycle events', async () => {
      const logs = await prisma.auditLog.findMany({
        where: {
          targetType: 'HANDOVER',
          OR: [{ actorId: userAId }, { actorId: userBId }],
        },
        orderBy: { createdAt: 'asc' },
      });

      const actions = logs.map((l) => l.action);
      expect(actions).toContain('HANDOVER_INITIATED');
      expect(actions).toContain('HANDOVER_CLAIMED');
      expect(actions).toContain('HANDOVER_COMPLETED');
    });
  });

  describe('4. Cancel Handover', () => {
    it('should allow User to cancel handover before OTP confirmation', async () => {
      // Tạo User D riêng để test cancel
      const defaultRole = await prisma.role.findUnique({ where: { name: 'USER' } });
      const passwordHash = await bcrypt.hash('Password@123456', 10);
      const userD = await prisma.user.create({
        data: {
          email: 'handover-user-d@gmail.com',
          password: passwordHash,
          fullName: 'User D Cancel Test',
          roleId: defaultRole!.id,
          isActive: true,
        },
      });

      const loginD = await request(app).post('/api/v1/auth/login').send({
        email: 'handover-user-d@gmail.com',
        password: 'Password@123456',
      });
      const tokenD = loginD.body.data.accessToken;

      // Khởi tạo
      const initRes = await request(app)
        .post('/api/v1/handover/initiate')
        .set('Authorization', `Bearer ${tokenD}`);
      expect(initRes.status).toBe(201);

      // Hủy
      const cancelRes = await request(app)
        .post('/api/v1/handover/cancel')
        .set('Authorization', `Bearer ${tokenD}`)
        .send({ handoverToken: initRes.body.data.handoverToken });

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.success).toBe(true);

      // Truy vấn lại status phải báo 404
      const statusRes = await request(app)
        .get('/api/v1/handover/status')
        .set('Authorization', `Bearer ${tokenD}`);
      expect(statusRes.status).toBe(404);

      // Dọn dẹp
      await prisma.auditLog.deleteMany({ where: { actorId: userD.id } });
      await prisma.refreshToken.deleteMany({ where: { userId: userD.id } });
      await prisma.user.delete({ where: { id: userD.id } });
    });
  });
});
