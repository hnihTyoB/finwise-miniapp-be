import { Prisma } from '@prisma/client';
import { UploadService } from '../src/modules/uploads/upload.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { BackupCryptoService } from '../src/modules/backup/backup-crypto';
import { BackupService } from '../src/modules/backup/backup.service';
import { backupFileStructureSchema } from '../src/modules/backup/backup.validation';
import { buildCsvBuffer } from '../src/modules/statements/exporters/csv-exporter';
import { ExportTransactionRow, ExportSummary } from '../src/modules/statements/statement.dto';
import { envConfig } from '../src/config/env.config';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';

describe('Wave 3 Security Fixes Verification Tests (SEC-W3-01 to SEC-W3-04)', () => {
  describe('SEC-W3-01: Arbitrary S3/R2 Object Deletion Defense', () => {
    const uploadService = new UploadService();
    const authService = new AuthService();

    it('should reject deleting storage file if objectKey belongs to another user', async () => {
      const sendSpy = jest.spyOn(S3Client.prototype as any, 'send').mockImplementation(async () => ({} as any));

      // Victim's avatar URL
      const victimUrl = `${envConfig.r2.publicBaseUrl}/avatars/victim-user-id/avatar.png`;
      const attackerUserId = 'attacker-user-id';

      await uploadService.deleteFileByUrl(victimUrl, attackerUserId);

      // Must NOT invoke DeleteObjectCommand
      expect(sendSpy).not.toHaveBeenCalled();
      sendSpy.mockRestore();
    });

    it('should reject deleting storage file if objectKey is outside avatars/ directory', async () => {
      const sendSpy = jest.spyOn(S3Client.prototype as any, 'send').mockImplementation(async () => ({} as any));

      // Attempt to delete a critical statement or backup
      const statementUrl = `${envConfig.r2.publicBaseUrl}/statements/some-user/statement.pdf`;

      await uploadService.deleteFileByUrl(statementUrl);

      expect(sendSpy).not.toHaveBeenCalled();
      sendSpy.mockRestore();
    });

    it('should reject updateAvatar if user tries to set avatarUrl belonging to another user in R2', async () => {
      const userId = '01a0b566-b93e-7991-92d9-7103c9753001';
      const foreignR2Url = `${envConfig.r2.publicBaseUrl}/avatars/other-user-uuid/secret.png`;

      jest.spyOn((authService as any).repository, 'findById').mockResolvedValue({
        id: userId,
        avatarUrl: null,
      });

      await expect(
        authService.updateAvatar(userId, { avatarUrl: foreignR2Url }),
      ).rejects.toThrow('Avatar URL must belong to the authenticated user');
    });

    it('should allow deleting file when objectKey belongs to the authorized user', async () => {
      const sendSpy = jest.spyOn(S3Client.prototype as any, 'send').mockImplementation(async () => ({} as any));
      const userId = '01a0b566-b93e-7991-92d9-7103c9753002';
      const userUrl = `${envConfig.r2.publicBaseUrl}/avatars/${userId}/my-avatar.png`;

      // Mock R2 credentials to allow execution
      const originalAccountId = envConfig.r2.accountId;
      envConfig.r2.accountId = 'test-account';
      envConfig.r2.bucketName = 'test-bucket';
      envConfig.r2.accessKeyId = 'test-key';
      envConfig.r2.secretAccessKey = 'test-secret';

      await uploadService.deleteFileByUrl(userUrl, userId);

      expect(sendSpy).toHaveBeenCalledWith(
        expect.any(DeleteObjectCommand),
      );

      sendSpy.mockRestore();
      envConfig.r2.accountId = originalAccountId;
    });
  });

  describe('SEC-W3-02: Denial of Service via Unbounded PBKDF2 Iterations Defense', () => {
    it('should reject backupFileStructureSchema when iterations exceed 600,000', () => {
      const maliciousPayload = {
        version: '1.0',
        appName: 'FinWise',
        exportedAt: new Date().toISOString(),
        isEncrypted: true,
        encryption: {
          algorithm: 'aes-256-gcm',
          kdf: 'pbkdf2',
          iterations: 10000000, // 10 million iterations (Event loop freeze DoS)
          salt: 'abcdef0123456789',
          iv: '0123456789abcdef',
          tag: '1234567890abcdef',
        },
        ciphertext: 'deadbeef',
        checksum: '12345678901234567890',
      };

      expect(() => backupFileStructureSchema.parse(maliciousPayload)).toThrow(
        'Số vòng lặp PBKDF2 tối đa là 600,000',
      );
    });

    it('should reject backupFileStructureSchema when iterations are below 1,000', () => {
      const weakPayload = {
        version: '1.0',
        appName: 'FinWise',
        exportedAt: new Date().toISOString(),
        isEncrypted: true,
        encryption: {
          algorithm: 'aes-256-gcm',
          kdf: 'pbkdf2',
          iterations: 50, // Insufficient key derivation work factor
          salt: 'abcdef0123456789',
          iv: '0123456789abcdef',
          tag: '1234567890abcdef',
        },
        ciphertext: 'deadbeef',
        checksum: '12345678901234567890',
      };

      expect(() => backupFileStructureSchema.parse(weakPayload)).toThrow(
        'Số vòng lặp PBKDF2 tối thiểu là 1,000',
      );
    });

    it('should reject decryptWithPassword when iterations exceed MAX_PBKDF2_ITERATIONS', () => {
      expect(() =>
        BackupCryptoService.decryptWithPassword(
          'aabbcc',
          'password123',
          {
            salt: '0123456789abcdef0123456789abcdef',
            iv: '0123456789abcdef01234567',
            tag: '0123456789abcdef0123456789abcdef',
            iterations: 10000000,
          },
        ),
      ).toThrow('Số vòng lặp PBKDF2 (10000000) không hợp lệ hoặc vượt ngưỡng an toàn cho phép');
    });

    it('should successfully encrypt and decrypt with safe iterations', () => {
      const plaintext = JSON.stringify({ test: 'safe-financial-data' });
      const password = 'CorrectPassword123!';

      const encrypted = BackupCryptoService.encryptWithPassword(plaintext, password);
      expect(encrypted.iterations).toBe(100000);

      const decrypted = BackupCryptoService.decryptWithPassword(
        encrypted.ciphertext,
        password,
        {
          salt: encrypted.salt,
          iv: encrypted.iv,
          tag: encrypted.tag,
          iterations: encrypted.iterations,
        },
      );

      expect(decrypted).toBe(plaintext);
    });
  });

  describe('SEC-W3-03: Cross-Tenant Receipt Injection Defense in Backup Import', () => {
    const backupService = new BackupService();

    it('should sanitize receiptUrl to null if it points to another user’s receipt path', async () => {
      const importingUserId = '01a0b566-b93e-7991-92d9-7103c9753010';
      const victimUserId = '01a0b566-b93e-7991-92d9-7103c9753011';
      const foreignReceiptKey = `receipts/${victimUserId}/stolen-invoice.pdf`;

      const backupData = {
        wallets: [
          {
            id: 'wallet-1',
            name: 'Ví Tiền Mặt',
            balance: '100000.00',
            currency: 'VND',
            isDefault: true,
          },
        ],
        categories: [
          {
            id: 'cat-1',
            name: 'Ăn uống',
            type: 'EXPENSE',
          },
        ],
        transactions: [
          {
            id: 'tx-1',
            walletId: 'wallet-1',
            categoryId: 'cat-1',
            amount: '50000.00',
            type: 'EXPENSE',
            description: 'Bữa trưa',
            receiptUrl: foreignReceiptKey, // Injected foreign receipt key!
            date: '2026-11-01',
          },
        ],
        transfers: [],
        budgets: [],
        savingGoals: [],
      };

      const canonicalString = BackupCryptoService.canonicalJsonStringify(backupData);
      const checksum = BackupCryptoService.computeSha256(canonicalString);

      const backupFile = {
        version: '1.0',
        appName: 'FinWise',
        exportedAt: new Date().toISOString(),
        isEncrypted: false,
        checksum,
        data: backupData,
      };

      let createdTransactionData: any = null;
      jest.spyOn((backupService as any).repository, 'runSerializable').mockImplementation(
        async (callback: any) => {
          const fakeTx = {
            wallet: {
              create: jest.fn().mockResolvedValue({ id: 'new-wallet-id', name: 'Ví Tiền Mặt', balance: new Prisma.Decimal(100000) }),
              update: jest.fn(),
            },
            category: {
              create: jest.fn().mockResolvedValue({ id: 'new-cat-id', name: 'Ăn uống' }),
            },
            transaction: {
              create: jest.fn().mockImplementation((args) => {
                createdTransactionData = args.data;
                return Promise.resolve({ id: 'new-tx-id', ...args.data });
              }),
            },
            transfer: { create: jest.fn() },
            budget: { create: jest.fn() },
            savingGoal: { create: jest.fn() },
            savingContribution: { create: jest.fn() },
          };
          return callback(fakeTx);
        },
      );

      jest.spyOn((backupService as any).repository, 'getUserActiveWallets').mockResolvedValue([]);
      jest.spyOn((backupService as any).repository, 'getUserAndSystemCategories').mockResolvedValue([]);
      jest.spyOn((backupService as any).repository, 'findExistingTransactions').mockResolvedValue([]);
      jest.spyOn((backupService as any).repository, 'findExistingTransfers').mockResolvedValue([]);
      jest.spyOn((backupService as any).repository, 'createAuditLog').mockResolvedValue({} as any);

      await backupService.importBackup(
        importingUserId,
        JSON.stringify(backupFile),
        { walletResolutions: [], balanceMode: 'ACCUMULATE' },
      );

      expect(createdTransactionData).not.toBeNull();
      // Crucial assertion: foreign receiptUrl MUST BE neutralized to null
      expect(createdTransactionData.receiptUrl).toBeNull();
    });

    it('should retain receiptUrl if it matches the importing user’s own receipt path', async () => {
      const importingUserId = '01a0b566-b93e-7991-92d9-7103c9753010';
      const ownReceiptKey = `receipts/${importingUserId}/my-invoice.pdf`;

      const backupData = {
        wallets: [
          {
            id: 'wallet-1',
            name: 'Ví Tiền Mặt',
            balance: '100000.00',
            currency: 'VND',
            isDefault: true,
          },
        ],
        categories: [
          {
            id: 'cat-1',
            name: 'Ăn uống',
            type: 'EXPENSE',
          },
        ],
        transactions: [
          {
            id: 'tx-1',
            walletId: 'wallet-1',
            categoryId: 'cat-1',
            amount: '50000.00',
            type: 'EXPENSE',
            description: 'Bữa trưa',
            receiptUrl: ownReceiptKey,
            date: '2026-11-01',
          },
        ],
        transfers: [],
        budgets: [],
        savingGoals: [],
      };

      const canonicalString = BackupCryptoService.canonicalJsonStringify(backupData);
      const checksum = BackupCryptoService.computeSha256(canonicalString);

      const backupFile = {
        version: '1.0',
        appName: 'FinWise',
        exportedAt: new Date().toISOString(),
        isEncrypted: false,
        checksum,
        data: backupData,
      };

      let createdTransactionData: any = null;
      jest.spyOn((backupService as any).repository, 'runSerializable').mockImplementation(
        async (callback: any) => {
          const fakeTx = {
            wallet: {
              create: jest.fn().mockResolvedValue({ id: 'new-wallet-id', name: 'Ví Tiền Mặt', balance: new Prisma.Decimal(100000) }),
              update: jest.fn(),
            },
            category: {
              create: jest.fn().mockResolvedValue({ id: 'new-cat-id', name: 'Ăn uống' }),
            },
            transaction: {
              create: jest.fn().mockImplementation((args) => {
                createdTransactionData = args.data;
                return Promise.resolve({ id: 'new-tx-id', ...args.data });
              }),
            },
            transfer: { create: jest.fn() },
            budget: { create: jest.fn() },
            savingGoal: { create: jest.fn() },
            savingContribution: { create: jest.fn() },
          };
          return callback(fakeTx);
        },
      );

      jest.spyOn((backupService as any).repository, 'getUserActiveWallets').mockResolvedValue([]);
      jest.spyOn((backupService as any).repository, 'getUserAndSystemCategories').mockResolvedValue([]);
      jest.spyOn((backupService as any).repository, 'findExistingTransactions').mockResolvedValue([]);
      jest.spyOn((backupService as any).repository, 'findExistingTransfers').mockResolvedValue([]);
      jest.spyOn((backupService as any).repository, 'createAuditLog').mockResolvedValue({} as any);

      await backupService.importBackup(
        importingUserId,
        JSON.stringify(backupFile),
        { walletResolutions: [], balanceMode: 'ACCUMULATE' },
      );

      expect(createdTransactionData).not.toBeNull();
      // Legitimate user receiptUrl is retained
      expect(createdTransactionData.receiptUrl).toBe(ownReceiptKey);
    });
  });

  describe('SEC-W3-04: CSV Formula Injection (CWE-1236) Defense', () => {
    const summary: ExportSummary = {
      openingBalance: '1000000.00',
      totalIncome: '500000.00',
      totalExpense: '200000.00',
      netSavings: '300000.00',
      closingBalance: '1300000.00',
      recordCount: 3,
      currency: 'VND',
      dateFrom: new Date('2026-11-01'),
      dateTo: new Date('2026-11-30'),
      userName: 'Nguyen Van A',
      walletName: 'Ví Cá Nhân',
    };

    it('should prepend single quote (\') to cells starting with formula trigger characters (=, +, -, @)', () => {
      const rows: ExportTransactionRow[] = [
        {
          id: '01a0b566-0001',
          date: new Date('2026-11-05'),
          walletName: 'Ví Chính',
          currency: 'VND',
          categoryName: 'Ăn uống',
          categoryType: 'EXPENSE',
          amount: '50000.00',
          description: '=cmd|\' /C calc\'!A0', // Dangerous formula injection!
          location: 'Hà Nội',
        },
        {
          id: '01a0b566-0002',
          date: new Date('2026-11-06'),
          walletName: 'Ví Chính',
          currency: 'VND',
          categoryName: 'Ăn uống',
          categoryType: 'EXPENSE',
          amount: '30000.00',
          description: '@SUM(1+1)', // @ trigger
          location: '+StoreLocation', // + trigger
        },
        {
          id: '01a0b566-0003',
          date: new Date('2026-11-07'),
          walletName: 'Ví Chính',
          currency: 'VND',
          categoryName: 'Ăn uống',
          categoryType: 'EXPENSE',
          amount: '20000.00',
          description: '-DiscountCoupon', // - trigger
          location: 'TP.HCM',
        },
      ];

      const csvBuffer = buildCsvBuffer(rows, summary);
      const csvContent = csvBuffer.toString('utf-8');

      // Assert formulas are neutralized with leading single quote
      expect(csvContent).toContain(`'=cmd|' /C calc'!A0`);
      expect(csvContent).toContain(`'@SUM(1+1)`);
      expect(csvContent).toContain(`'+StoreLocation`);
      expect(csvContent).toContain(`'-DiscountCoupon`);
    });

    it('should not prepend single quote to ordinary safe text descriptions', () => {
      const rows: ExportTransactionRow[] = [
        {
          id: '01a0b566-0004',
          date: new Date('2026-11-08'),
          walletName: 'Ví Chính',
          currency: 'VND',
          categoryName: 'Mua sắm',
          categoryType: 'EXPENSE',
          amount: '150000.00',
          description: 'Cơm trưa văn phòng',
          location: 'Quán ăn ngon',
        },
      ];

      const csvBuffer = buildCsvBuffer(rows, summary);
      const csvContent = csvBuffer.toString('utf-8');

      expect(csvContent).toContain('Cơm trưa văn phòng');
      expect(csvContent).not.toContain('\'Cơm trưa văn phòng');
    });
  });

  describe('SEC-W3-05: Cryptographic CSPRNG Verification Code Generation Defense', () => {
    it('should generate a 16-character CSPRNG hex verification code with FW- prefix', async () => {
      const { StatementService } = await import('../src/modules/statements/statement.service');
      const statementService = new StatementService();
      const userId = '01a0b566-b93e-7991-92d9-7103c9753020';

      let capturedCreationData: any = null;
      jest.spyOn((statementService as any).repository, 'create').mockImplementation((data: any) => {
        capturedCreationData = data;
        return Promise.resolve({ id: 'job-id', ...data, createdAt: new Date() });
      });

      const { statementQueueService } = await import('../src/modules/statements/statement-queue.service');
      jest.spyOn(statementQueueService, 'enqueue').mockResolvedValue(undefined);

      await statementService.initiateExport(userId, {
        dateFrom: '2026-11-01',
        dateTo: '2026-11-30',
        format: 'PDF',
      });

      expect(capturedCreationData).not.toBeNull();
      const code = capturedCreationData.verificationCode;
      expect(code).toMatch(/^FW-[0-9A-F]{16}$/);
      // Ensure length is exactly 19 ('FW-' (3) + 16 hex digits)
      expect(code.length).toBe(19);
    });
  });

  describe('SEC-W3-06: Query String Sensitive Password Prevention on Backup Export', () => {
    it('should reject exportBackup when password is provided in req.query (CWE-598)', async () => {
      const { backupController } = await import('../src/modules/backup/backup.controller');
      const req: any = {
        user: { id: 'user-uuid' },
        query: { password: 'SensitivePassword123' },
        body: {},
      };
      const res: any = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      let capturedError: any = null;
      const next = jest.fn().mockImplementation((err) => {
        capturedError = err;
      });

      await backupController.exportBackup(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(capturedError).not.toBeNull();
      expect(capturedError.message).toContain('Không được truyền mật khẩu bảo vệ bản sao lưu qua URL query parameter');
    });

    it('should allow exportBackup when password is provided securely in req.body', async () => {
      const { backupController } = await import('../src/modules/backup/backup.controller');
      const { backupService } = await import('../src/modules/backup/backup.service');

      const req: any = {
        user: { id: 'user-uuid' },
        query: {},
        body: { password: 'SecurePassword123' },
      };
      const res: any = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      jest.spyOn(backupService, 'exportBackup').mockResolvedValue({
        version: '1.0',
        appName: 'FinWise',
        exportedAt: new Date().toISOString(),
        isEncrypted: true,
        checksum: 'checksum-mock',
      } as any);

      await backupController.exportBackup(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('SEC-W3-07: Off-By-One Inclusive End Date in Statement Export & AI Analysis Context', () => {
    it('should use lte for dateTo in TransactionRepository.findBatchForExport to include end-date transactions', async () => {
      const { TransactionRepository } = await import('../src/modules/transactions/transaction.repository');
      const transactionRepo = new TransactionRepository();
      const { prisma } = await import('../src/database/prisma.client');

      const findManySpy = jest.spyOn(prisma.transaction, 'findMany').mockResolvedValue([]);

      const dateFrom = new Date('2026-11-01T00:00:00.000Z');
      const dateTo = new Date('2026-11-30T00:00:00.000Z');

      await transactionRepo.findBatchForExport({
        userId: 'test-user-uuid',
        dateFrom,
        dateTo,
        batchSize: 10,
      });

      expect(findManySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            date: expect.objectContaining({
              gte: dateFrom,
              lte: dateTo, // Must be lte (inclusive) rather than lt
            }),
          }),
        }),
      );

      findManySpy.mockRestore();
    });

    it('should use lte for businessTo in AIAssistantRepository.getFinancialContext to include end-date transactions', async () => {
      const { AIAssistantRepository } = await import('../src/modules/ai-assistant/ai-assistant.repository');
      const aiRepo = new AIAssistantRepository();
      const { prisma } = await import('../src/database/prisma.client');

      const findManySpy = jest.spyOn(prisma.transaction, 'findMany').mockResolvedValue([]);
      jest.spyOn(prisma.wallet, 'findMany').mockResolvedValue([]);
      jest.spyOn(prisma.category, 'findMany').mockResolvedValue([]);
      jest.spyOn(prisma.transaction, 'count').mockResolvedValue(0);
      jest.spyOn(prisma.transaction, 'groupBy').mockResolvedValue([]);
      jest.spyOn(prisma.budget, 'findMany').mockResolvedValue([]);
      jest.spyOn(prisma.budget, 'count').mockResolvedValue(0);
      jest.spyOn(prisma.savingGoal, 'findMany').mockResolvedValue([]);
      jest.spyOn(prisma.savingGoal, 'count').mockResolvedValue(0);

      const from = new Date('2026-11-01T00:00:00.000Z');
      const to = new Date('2026-11-30T00:00:00.000Z');

      await aiRepo.getFinancialContext('test-user-uuid', from, to, 50);

      expect(findManySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            date: expect.objectContaining({
              lte: expect.any(Date), // Must be lte rather than lt
            }),
          }),
        }),
      );

      findManySpy.mockRestore();
    });
  });

  describe('SEC-W3-08: Savings Account Exclusion from Backup Wallet Merge Defense', () => {
    it('should strictly query only type: STANDARD wallets in BackupRepository.getUserActiveWallets', async () => {
      const { BackupRepository } = await import('../src/modules/backup/backup.repository');
      const backupRepo = new BackupRepository();
      const { prisma } = await import('../src/database/prisma.client');

      const findManySpy = jest.spyOn(prisma.wallet, 'findMany').mockResolvedValue([]);

      await backupRepo.getUserActiveWallets('test-user-uuid');

      expect(findManySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'test-user-uuid',
            isArchived: false,
            type: 'STANDARD', // Must strictly filter type STANDARD (excluding SAVINGS_ACCOUNT)
          }),
        }),
      );

      findManySpy.mockRestore();
    });
  });
});
