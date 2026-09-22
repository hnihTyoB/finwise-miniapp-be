import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/database/prisma.client';
import bcrypt from 'bcryptjs';
import { BackupCryptoService } from '../src/modules/backup/backup-crypto';

describe('Backup Export & Smart Merge Import Integration Tests', () => {
  const userA = {
    email: 'backup-user-a@gmail.com',
    password: 'Password@123456',
    fullName: 'Backup User A',
  };

  const userB = {
    email: 'backup-user-b@gmail.com',
    password: 'Password@123456',
    fullName: 'Backup User B',
  };

  const userC = {
    email: 'backup-user-c@gmail.com',
    password: 'Password@123456',
    fullName: 'Backup User C',
  };

  let tokenA = '';
  let tokenB = '';
  let tokenC = '';
  let userAId = '';
  let userBId = '';
  let userCId = '';

  let plainBackupFile: any = null;
  let encryptedBackupFile: any = null;

  beforeAll(async () => {
    const defaultRole = await prisma.role.findUnique({ where: { name: 'USER' } });
    const passwordHash = await bcrypt.hash('Password@123456', 10);

    // Tạo User A
    const createdA = await prisma.user.create({
      data: {
        email: userA.email,
        password: passwordHash,
        fullName: userA.fullName,
        roleId: defaultRole!.id,
        isActive: true,
      },
    });
    userAId = createdA.id;

    // Tạo User B (Tài khoản trống)
    const createdB = await prisma.user.create({
      data: {
        email: userB.email,
        password: passwordHash,
        fullName: userB.fullName,
        roleId: defaultRole!.id,
        isActive: true,
      },
    });
    userBId = createdB.id;

    // Tạo User C (Tài khoản đã có dữ liệu để test Merge)
    const createdC = await prisma.user.create({
      data: {
        email: userC.email,
        password: passwordHash,
        fullName: userC.fullName,
        roleId: defaultRole!.id,
        isActive: true,
      },
    });
    userCId = createdC.id;

    // Login để lấy tokens
    const loginA = await request(app).post('/api/v1/auth/login').send({ email: userA.email, password: userA.password });
    tokenA = loginA.body.data.accessToken;

    const loginB = await request(app).post('/api/v1/auth/login').send({ email: userB.email, password: userB.password });
    tokenB = loginB.body.data.accessToken;

    const loginC = await request(app).post('/api/v1/auth/login').send({ email: userC.email, password: userC.password });
    tokenC = loginC.body.data.accessToken;

    // Tạo dữ liệu tài chính cho User A: 2 ví, 2 danh mục, 3 giao dịch, 1 chuyển tiền, 1 ngân sách, 1 mục tiêu
    const wallet1 = await prisma.wallet.create({
      data: {
        userId: userAId,
        name: 'Ví Tiền Mặt A',
        balance: 1500000.0,
        currency: 'VND',
        icon: 'cash',
        isDefault: true,
      },
    });

    const wallet2 = await prisma.wallet.create({
      data: {
        userId: userAId,
        name: 'Ví Ngân Hàng A',
        balance: 5000000.0,
        currency: 'VND',
        icon: 'card',
        isDefault: false,
      },
    });

    const category1 = await prisma.category.create({
      data: {
        userId: userAId,
        name: 'Ăn Uống Hàng Ngày',
        type: 'EXPENSE',
        icon: 'food',
        isSystem: false,
      },
    });

    const category2 = await prisma.category.create({
      data: {
        userId: userAId,
        name: 'Tiền Lương Hàng Tháng',
        type: 'INCOME',
        icon: 'salary',
        isSystem: false,
      },
    });

    await prisma.transaction.create({
      data: {
        userId: userAId,
        walletId: wallet1.id,
        categoryId: category1.id,
        amount: 75000.0,
        type: 'EXPENSE',
        description: 'Ăn phở bò',
        date: new Date('2026-09-15'),
      },
    });

    await prisma.transaction.create({
      data: {
        userId: userAId,
        walletId: wallet1.id,
        categoryId: category1.id,
        amount: 120000.0,
        type: 'EXPENSE',
        description: 'Ăn tối lẩu',
        date: new Date('2026-09-16'),
      },
    });

    await prisma.transaction.create({
      data: {
        userId: userAId,
        walletId: wallet2.id,
        categoryId: category2.id,
        amount: 15000000.0,
        type: 'INCOME',
        description: 'Lương tháng 9',
        date: new Date('2026-09-10'),
      },
    });

    await prisma.transfer.create({
      data: {
        userId: userAId,
        sourceWalletId: wallet2.id,
        destinationWalletId: wallet1.id,
        amount: 2000000.0,
        note: 'Rút tiền mặt tiêu dùng',
        transferredAt: new Date('2026-09-12T10:00:00Z'),
      },
    });

    await prisma.budget.create({
      data: {
        userId: userAId,
        categoryId: category1.id,
        name: 'Ngân sách ăn uống T9',
        amount: 3000000.0,
        currency: 'VND',
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-09-30'),
      },
    });

    const savingGoal = await prisma.savingGoal.create({
      data: {
        userId: userAId,
        name: 'Mua xe máy',
        targetAmount: 30000000.0,
        currency: 'VND',
        targetDate: new Date('2026-12-31'),
        description: 'Honda Vision',
      },
    });

    await prisma.savingContribution.create({
      data: {
        savingGoalId: savingGoal.id,
        amount: 5000000.0,
        contributedAt: new Date('2026-09-14T08:00:00Z'),
        note: 'Tiết kiệm đầu tháng',
      },
    });

    // Tạo sẵn 1 ví và 1 danh mục cho User C
    await prisma.wallet.create({
      data: {
        userId: userCId,
        name: 'Ví Đích Của User C',
        balance: 2000000.0,
        currency: 'VND',
        isDefault: true,
      },
    });

    await prisma.category.create({
      data: {
        userId: userCId,
        name: 'Ăn Uống Hàng Ngày', // Trùng tên & loại với category của User A
        type: 'EXPENSE',
        icon: 'food',
        isSystem: false,
      },
    });
  });

  afterAll(async () => {
    const userIds = [userAId, userBId, userCId];
    for (const uid of userIds) {
      if (!uid) continue;
      await prisma.auditLog.deleteMany({ where: { actorId: uid } });
      await prisma.savingContribution.deleteMany({
        where: { savingGoal: { userId: uid } },
      });
      await prisma.savingGoal.deleteMany({ where: { userId: uid } });
      await prisma.budget.deleteMany({ where: { userId: uid } });
      await prisma.transaction.deleteMany({ where: { userId: uid } });
      await prisma.transfer.deleteMany({ where: { userId: uid } });
      await prisma.category.deleteMany({ where: { userId: uid } });
      await prisma.wallet.deleteMany({ where: { userId: uid } });
      await prisma.userDevice.deleteMany({ where: { userId: uid } });
      await prisma.refreshToken.deleteMany({ where: { userId: uid } });
      await prisma.user.deleteMany({ where: { id: uid } });
    }
  });

  describe('1. Export Backup Tests', () => {
    it('should export plain JSON backup with valid checksum', async () => {
      const res = await request(app)
        .get('/api/v1/backup/export')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.version).toBe('1.0');
      expect(res.body.data.appName).toBe('FinWise');
      expect(res.body.data.isEncrypted).toBe(false);
      expect(typeof res.body.data.checksum).toBe('string');
      expect(res.body.data.data.wallets.length).toBe(2);
      expect(res.body.data.data.categories.length).toBe(2);
      expect(res.body.data.data.transactions.length).toBe(3);
      expect(res.body.data.data.transfers.length).toBe(1);
      expect(res.body.data.data.budgets.length).toBe(1);
      expect(res.body.data.data.savingGoals.length).toBe(1);
      expect(res.body.data.data.savingGoals[0].contributions.length).toBe(1);

      // Verify canonical checksum
      const canonicalData = BackupCryptoService.canonicalJsonStringify(res.body.data.data);
      expect(BackupCryptoService.verifySha256(canonicalData, res.body.data.checksum)).toBe(true);

      plainBackupFile = res.body.data;
    });

    it('should export password-encrypted backup file', async () => {
      const res = await request(app)
        .post('/api/v1/backup/export')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ password: 'StrongPassword@123' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isEncrypted).toBe(true);
      expect(res.body.data.encryption).toBeDefined();
      expect(res.body.data.encryption.algorithm).toBe('aes-256-gcm');
      expect(typeof res.body.data.ciphertext).toBe('string');
      expect(res.body.data.data).toBeUndefined(); // Không để lộ dữ liệu chưa mã hóa

      encryptedBackupFile = res.body.data;
    });
  });

  describe('2. Preview Backup & Validation Tests', () => {
    it('should correctly preview clean file on empty account (User B)', async () => {
      const res = await request(app)
        .post('/api/v1/backup/preview')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ fileContent: JSON.stringify(plainBackupFile) });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accountStatus).toBe('EMPTY');
      expect(res.body.data.isChecksumValid).toBe(true);
      expect(res.body.data.summary.walletsCount).toBe(2);
      expect(res.body.data.summary.transactionsCount).toBe(3);
      expect(res.body.data.summary.transfersCount).toBe(1);
      expect(res.body.data.summary.budgetsCount).toBe(1);
      expect(res.body.data.summary.savingGoalsCount).toBe(1);
      expect(res.body.data.wallets.length).toBe(2);
    });

    it('should reject tampered file where checksum does not match', async () => {
      const tamperedFile = JSON.parse(JSON.stringify(plainBackupFile));
      tamperedFile.data.wallets[0].balance = '999999999.00'; // sửa trộm số dư ví

      const res = await request(app)
        .post('/api/v1/backup/preview')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ fileContent: JSON.stringify(tamperedFile) });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('BACKUP_CHECKSUM_INVALID');
    });

    it('should require password when previewing encrypted file', async () => {
      const res = await request(app)
        .post('/api/v1/backup/preview')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ fileContent: JSON.stringify(encryptedBackupFile) });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('BACKUP_PASSWORD_REQUIRED');
    });

    it('should fail with wrong password on encrypted file', async () => {
      const res = await request(app)
        .post('/api/v1/backup/preview')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          fileContent: JSON.stringify(encryptedBackupFile),
          password: 'WrongPassword@999',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('BACKUP_PASSWORD_INVALID');
    });

    it('should successfully decrypt and preview with correct password', async () => {
      const res = await request(app)
        .post('/api/v1/backup/preview')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          fileContent: JSON.stringify(encryptedBackupFile),
          password: 'StrongPassword@123',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.summary.transactionsCount).toBe(3);
    });
  });

  describe('3. Clean Import into Empty Account (User B) Tests', () => {
    it('should import 100% data accurately with matching balances and records', async () => {
      const res = await request(app)
        .post('/api/v1/backup/import')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          fileContent: JSON.stringify(plainBackupFile),
          walletResolutions: [],
          balanceMode: 'ACCUMULATE',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.importedCount.wallets).toBe(2);
      expect(res.body.data.importedCount.categories).toBe(2);
      expect(res.body.data.importedCount.transactions).toBe(3);
      expect(res.body.data.importedCount.transfers).toBe(1);
      expect(res.body.data.importedCount.budgets).toBe(1);
      expect(res.body.data.importedCount.savingGoals).toBe(1);
      expect(res.body.data.importedCount.savingContributions).toBe(1);

      // Kiểm tra ví tiền trong database của User B
      const walletsB = await prisma.wallet.findMany({ where: { userId: userBId } });
      expect(walletsB.length).toBe(2);
      const wallet1B = walletsB.find((w) => w.name === 'Ví Tiền Mặt A');
      const wallet2B = walletsB.find((w) => w.name === 'Ví Ngân Hàng A');
      expect(wallet1B).toBeDefined();
      expect(wallet2B).toBeDefined();
      expect(wallet1B?.balance.toFixed(2)).toBe('1500000.00');
      expect(wallet2B?.balance.toFixed(2)).toBe('5000000.00');

      // Kiểm tra giao dịch
      const txsB = await prisma.transaction.findMany({ where: { userId: userBId } });
      expect(txsB.length).toBe(3);

      // Kiểm tra chuyển khoản
      const transfersB = await prisma.transfer.findMany({ where: { userId: userBId } });
      expect(transfersB.length).toBe(1);
      expect(transfersB[0].amount.toFixed(2)).toBe('2000000.00');

      // Kiểm tra AuditLog
      const auditLog = await prisma.auditLog.findFirst({
        where: { actorId: userBId, action: 'BACKUP_IMPORT' },
      });
      expect(auditLog).toBeDefined();
      expect(auditLog?.targetType).toBe('BACKUP');
    });

    it('should deduplicate and skip existing transactions if re-imported', async () => {
      // Nạp lại cùng file một lần nữa vào User B
      const res = await request(app)
        .post('/api/v1/backup/import')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          fileContent: JSON.stringify(plainBackupFile),
          walletResolutions: [],
          balanceMode: 'ACCUMULATE',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // Giao dịch và chuyển khoản phải bị phát hiện trùng lặp
      expect(res.body.data.skippedDuplicates.transactions).toBe(3);
      expect(res.body.data.skippedDuplicates.transfers).toBe(1);

      // Tổng số giao dịch trong DB vẫn giữ nguyên là 3, không bị nhân đôi
      const txCount = await prisma.transaction.count({ where: { userId: userBId } });
      expect(txCount).toBe(3);
    });
  });

  describe('4. Smart Merge into Account with Existing Data (User C) Tests', () => {
    it('should merge wallet and auto-merge duplicate categories without error', async () => {
      const walletC = await prisma.wallet.findFirst({ where: { userId: userCId } });
      expect(walletC).toBeDefined();

      const oldWalletIdToMerge = plainBackupFile.data.wallets[0].id; // 'Ví Tiền Mặt A'

      const res = await request(app)
        .post('/api/v1/backup/import')
        .set('Authorization', `Bearer ${tokenC}`)
        .send({
          fileContent: JSON.stringify(plainBackupFile),
          walletResolutions: [
            {
              oldWalletId: oldWalletIdToMerge,
              action: 'MERGE',
              targetWalletId: walletC!.id,
            },
          ],
          balanceMode: 'ACCUMULATE',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Ví tiền mặt cũ được gộp vào Ví C -> Chỉ tạo thêm 1 ví mới ('Ví Ngân Hàng A')
      expect(res.body.data.importedCount.wallets).toBe(1);

      // Danh mục 'Ăn Uống Hàng Ngày' đã có sẵn ở User C -> Tự động nhận diện và gộp -> Chỉ tạo thêm danh mục 'Tiền Lương Hàng Tháng'
      expect(res.body.data.importedCount.categories).toBe(1);

      // Kiểm tra số dư ví C sau khi gộp cộng dồn: 2,000,000 + 1,500,000 = 3,500,000
      const updatedWalletC = await prisma.wallet.findUnique({ where: { id: walletC!.id } });
      expect(updatedWalletC?.balance.toFixed(2)).toBe('3500000.00');

      // Các giao dịch thuộc ví tiền mặt cũ đã được chuyển sang ví C
      const txsInWalletC = await prisma.transaction.findMany({
        where: { userId: userCId, walletId: walletC!.id },
      });
      expect(txsInWalletC.length).toBe(2);
    });
  });

  describe('5. High-Volume Dataset Test (3,000+ Transactions)', () => {
    it('should handle large dataset without crash or timeout', async () => {
      // Sinh mock dataset 3.000 giao dịch
      const largeTransactions = [];
      const baseDate = new Date('2025-01-01');

      for (let i = 0; i < 3000; i++) {
        const d = new Date(baseDate.getTime() + i * 3600 * 1000);
        largeTransactions.push({
          id: `tx-large-${i}`,
          walletId: plainBackupFile.data.wallets[0].id,
          categoryId: plainBackupFile.data.categories[0].id,
          amount: (10000 + (i % 100) * 1000).toFixed(2),
          type: (i % 5 === 0 ? 'INCOME' : 'EXPENSE') as 'INCOME' | 'EXPENSE',
          description: `Giao dịch thử nghiệm tải lớn #${i}`,
          date: d.toISOString().slice(0, 10),
          createdAt: d.toISOString(),
        });
      }

      const largePayload = {
        ...plainBackupFile.data,
        transactions: largeTransactions,
      };

      const canonicalString = BackupCryptoService.canonicalJsonStringify(largePayload);
      const largeFile = {
        version: '1.0',
        appName: 'FinWise',
        exportedAt: new Date().toISOString(),
        isEncrypted: false,
        checksum: BackupCryptoService.computeSha256(canonicalString),
        data: largePayload,
      };

      // Preview file 3.000 giao dịch
      const previewRes = await request(app)
        .post('/api/v1/backup/preview')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ fileContent: JSON.stringify(largeFile) });

      expect(previewRes.status).toBe(200);
      expect(previewRes.body.data.summary.transactionsCount).toBe(3000);
      expect(previewRes.body.data.isChecksumValid).toBe(true);
    });
  });
});
