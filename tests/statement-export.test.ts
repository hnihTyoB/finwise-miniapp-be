import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/database/prisma.client';
import bcrypt from 'bcryptjs';
import { buildCsvBuffer } from '../src/modules/statements/exporters/csv-exporter';
import { buildExcelBuffer } from '../src/modules/statements/exporters/excel-exporter';
import { buildPdfBuffer } from '../src/modules/statements/exporters/pdf-exporter';
import { ExportTransactionRow, ExportSummary } from '../src/modules/statements/statement.dto';

describe('Statement Export Integration & Unit Tests', () => {
  const testUser = {
    email: 'stmt-test@gmail.com',
    password: 'Password@123456',
    fullName: 'Nguyen Van Statement',
  };

  const otherUser = {
    email: 'other-stmt@gmail.com',
    password: 'Password@123456',
    fullName: 'Other User',
  };

  let userId = '';
  let otherUserId = '';
  let accessToken = '';
  let otherAccessToken = '';
  let walletId = '';
  let createdJobId = '';
  let verificationCode = '';

  beforeAll(async () => {
    // Setup test users
    const defaultRole = await prisma.role.findUnique({ where: { name: 'USER' } });

    // Ensure statement permissions are assigned to USER role for test
    const exportPerm = await prisma.permission.upsert({
      where: { name: 'STATEMENT_EXPORT' },
      update: {},
      create: {
        name: 'STATEMENT_EXPORT',
        resource: 'STATEMENT',
        action: 'EXPORT',
        description: 'Export statements',
        isSystem: true,
      },
    });

    const readPerm = await prisma.permission.upsert({
      where: { name: 'STATEMENT_READ' },
      update: {},
      create: {
        name: 'STATEMENT_READ',
        resource: 'STATEMENT',
        action: 'READ',
        description: 'Read statements',
        isSystem: true,
      },
    });

    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: defaultRole!.id, permissionId: exportPerm.id } },
      update: {},
      create: { roleId: defaultRole!.id, permissionId: exportPerm.id },
    });

    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: defaultRole!.id, permissionId: readPerm.id } },
      update: {},
      create: { roleId: defaultRole!.id, permissionId: readPerm.id },
    });

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

    const other = await prisma.user.create({
      data: {
        email: otherUser.email,
        password: passwordHash,
        fullName: otherUser.fullName,
        roleId: defaultRole!.id,
        isActive: true,
      },
    });
    otherUserId = other.id;

    // Login to get tokens
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: testUser.email, password: testUser.password });
    accessToken = loginRes.body.data.accessToken;

    const otherLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: otherUser.email, password: otherUser.password });
    otherAccessToken = otherLoginRes.body.data.accessToken;

    // Create a wallet for test user
    const wallet = await prisma.wallet.create({
      data: {
        userId,
        name: 'Ví Chính Test',
        balance: 1000000,
        currency: 'VND',
        isDefault: true,
      },
    });
    walletId = wallet.id;

    // Create system category
    const category = await prisma.category.findFirst({
      where: { isSystem: true, type: 'EXPENSE' },
    });

    // Create mock transactions
    if (category) {
      await prisma.transaction.createMany({
        data: [
          {
            userId,
            walletId,
            categoryId: category.id,
            amount: 50000,
            type: 'EXPENSE',
            description: 'Cà phê sáng',
            date: new Date('2026-01-15'),
          },
          {
            userId,
            walletId,
            categoryId: category.id,
            amount: 150000,
            type: 'EXPENSE',
            description: 'Ăn trưa',
            date: new Date('2026-02-10'),
          },
        ],
      });
    }
  });

  afterAll(async () => {
    await prisma.statementJob.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
    await prisma.transaction.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
    await prisma.wallet.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
  });

  describe('POST /api/v1/statements/export', () => {
    it('should successfully initiate export and return 202 Accepted', async () => {
      const res = await request(app)
        .post('/api/v1/statements/export')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          walletId,
          dateFrom: '2026-01-01',
          dateTo: '2026-03-01',
          format: 'XLSX',
          password: 'Password123',
          passwordHint: 'Mật khẩu mẫu',
        });

      expect(res.status).toBe(202);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('PENDING');
      expect(res.body.data.format).toBe('XLSX');
      expect(res.body.data.isPasswordProtected).toBe(true);
      expect(res.body.data.checkStatusUrl).toBeDefined();

      createdJobId = res.body.data.jobId;

      // Verify in DB
      const dbJob = await prisma.statementJob.findUnique({ where: { id: createdJobId } });
      expect(dbJob).toBeDefined();
      expect(dbJob?.userId).toBe(userId);
      verificationCode = dbJob!.verificationCode;
    });

    it('should reject invalid date range (dateFrom >= dateTo) with 422', async () => {
      const res = await request(app)
        .post('/api/v1/statements/export')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          dateFrom: '2026-05-01',
          dateTo: '2026-01-01',
          format: 'PDF',
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it('should reject walletId belonging to another user (IDOR protection)', async () => {
      const res = await request(app)
        .post('/api/v1/statements/export')
        .set('Authorization', `Bearer ${otherAccessToken}`)
        .send({
          walletId, // belongs to testUser, not otherUser
          dateFrom: '2026-01-01',
          dateTo: '2026-03-01',
          format: 'PDF',
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/statements/jobs/:id', () => {
    it('should retrieve job status for the owner', async () => {
      const res = await request(app)
        .get(`/api/v1/statements/jobs/${createdJobId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.jobId).toBe(createdJobId);
      expect(['PENDING', 'PROCESSING', 'COMPLETED']).toContain(res.body.data.status);
    });

    it('should reject access to another user\'s job (IDOR protection) with 404', async () => {
      const res = await request(app)
        .get(`/api/v1/statements/jobs/${createdJobId}`)
        .set('Authorization', `Bearer ${otherAccessToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/statements/history', () => {
    it('should return paginated history of jobs for authenticated user', async () => {
      const res = await request(app)
        .get('/api/v1/statements/history')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.meta).toBeDefined();
      expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /api/v1/statements/jobs/:id/download', () => {
    it('should reject download when job is still PENDING with 400', async () => {
      const res = await request(app)
        .get(`/api/v1/statements/jobs/${createdJobId}/download`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('STATEMENT_NOT_READY');
    });

    it('should reject access to another user\'s statement file (IDOR) with 404', async () => {
      const res = await request(app)
        .get(`/api/v1/statements/jobs/${createdJobId}/download`)
        .set('Authorization', `Bearer ${otherAccessToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should successfully stream local file when job is COMPLETED and fileUrl is local', async () => {
      // Create a dedicated completed job record to avoid race conditions with async queue
      const localJob = await prisma.statementJob.create({
        data: {
          userId,
          format: 'XLSX',
          dateFrom: new Date('2026-08-01'),
          dateTo: new Date('2026-08-31'),
          status: 'COMPLETED',
          completedAt: new Date(),
          fileSize: 18,
          expiresAt: new Date(Date.now() + 48 * 3600 * 1000),
          verificationCode: `FW-LOCAL-${Date.now().toString(36).toUpperCase()}`,
        },
      });

      // Create dummy file in storage/exports/${userId}/
      const { mkdirSync, writeFileSync } = await import('fs');
      const testDir = `storage/exports/${userId}`;
      mkdirSync(testDir, { recursive: true });
      writeFileSync(`${testDir}/${localJob.id}.xlsx`, Buffer.from('mock-excel-content'));

      await prisma.statementJob.update({
        where: { id: localJob.id },
        data: {
          fileUrl: `/api/v1/statements/jobs/${localJob.id}/download`,
        },
      });

      const res = await request(app)
        .get(`/api/v1/statements/jobs/${localJob.id}/download`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.headers['content-disposition']).toContain(`finwise-statement-${localJob.id.slice(0, 8)}.xlsx`);
    });

    it('should redirect (302) when fileUrl is an external cloud storage URL', async () => {
      await prisma.statementJob.update({
        where: { id: createdJobId },
        data: {
          fileUrl: 'https://r2.finwise.app/statements/test-file.xlsx',
          status: 'COMPLETED',
        },
      });

      const res = await request(app)
        .get(`/api/v1/statements/jobs/${createdJobId}/download`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('https://r2.finwise.app/statements/test-file.xlsx');
    });

    it('should also work on /api/v1/statements/download/:id alias for local file', async () => {
      const aliasJob = await prisma.statementJob.create({
        data: {
          userId,
          format: 'XLSX',
          dateFrom: new Date('2026-08-01'),
          dateTo: new Date('2026-08-31'),
          status: 'COMPLETED',
          completedAt: new Date(),
          fileSize: 18,
          expiresAt: new Date(Date.now() + 48 * 3600 * 1000),
          verificationCode: `FW-ALIAS-${Date.now().toString(36).toUpperCase()}`,
        },
      });

      const { mkdirSync, writeFileSync } = await import('fs');
      const testDir = `storage/exports/${userId}`;
      mkdirSync(testDir, { recursive: true });
      writeFileSync(`${testDir}/${aliasJob.id}.xlsx`, Buffer.from('mock-excel-content'));

      const res = await request(app)
        .get(`/api/v1/statements/download/${aliasJob.id}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toContain('attachment');
    });

    it('should successfully download using token in query string without Authorization header', async () => {
      const queryJob = await prisma.statementJob.create({
        data: {
          userId,
          format: 'CSV',
          dateFrom: new Date('2026-08-01'),
          dateTo: new Date('2026-08-31'),
          status: 'COMPLETED',
          completedAt: new Date(),
          fileSize: 15,
          expiresAt: new Date(Date.now() + 48 * 3600 * 1000),
          verificationCode: `FW-QUERY-${Date.now().toString(36).toUpperCase()}`,
        },
      });

      const { mkdirSync, writeFileSync } = await import('fs');
      const exportDir = `storage/exports/${userId}`;
      mkdirSync(exportDir, { recursive: true });
      writeFileSync(`${exportDir}/${queryJob.id}.csv`, 'col1,col2\nval1,val2');

      const res = await request(app)
        .get(`/api/v1/statements/jobs/${queryJob.id}/download?token=${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain(`attachment; filename="finwise-statement-${queryJob.id.slice(0, 8)}.csv"`);
    });
  });

  describe('GET /api/v1/statements/verify/:code (Public)', () => {
    it('should return statement verification details by code', async () => {
      const res = await request(app)
        .get(`/api/v1/statements/verify/${verificationCode}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.verificationCode).toBe(verificationCode);
      // User name should be masked (e.g., Ng*** V** S***)
      expect(res.body.data.userName).toContain('*');
    });

    it('should return isValid: false for nonexistent verification code', async () => {
      const res = await request(app)
        .get('/api/v1/statements/verify/NONEXISTENT-CODE-12345');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isValid).toBe(false);
    });
  });

  describe('Exporters Unit Tests', () => {
    const mockSummary: ExportSummary = {
      openingBalance: '1000000.00',
      totalIncome: '500000.00',
      totalExpense: '200000.00',
      netSavings: '300000.00',
      closingBalance: '1300000.00',
      recordCount: 2,
      currency: 'VND',
      dateFrom: new Date('2026-01-01'),
      dateTo: new Date('2026-02-01'),
      userName: 'Nguyen Van A',
      walletName: 'Ví Tiền Mặt',
    };

    const mockRows: ExportTransactionRow[] = [
      {
        id: '019488b1-0000-7000-8000-000000000001',
        date: new Date('2026-01-10'),
        walletName: 'Ví Tiền Mặt',
        currency: 'VND',
        categoryName: 'Ăn uống',
        categoryType: 'EXPENSE',
        amount: '120000.00',
        description: 'Ăn tối cùng bạn bè',
        location: 'Hà Nội',
      },
      {
        id: '019488b1-0000-7000-8000-000000000002',
        date: new Date('2026-01-15'),
        walletName: 'Ví Tiền Mặt',
        currency: 'VND',
        categoryName: 'Lương',
        categoryType: 'INCOME',
        amount: '500000.00',
        description: 'Thưởng tết',
        location: null,
      },
    ];

    it('buildCsvBuffer should produce valid CSV with UTF-8 BOM', () => {
      const buffer = buildCsvBuffer(mockRows, mockSummary);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);

      const text = buffer.toString('utf-8');
      // Starts with UTF-8 BOM
      expect(text.charCodeAt(0)).toBe(0xFEFF);
      expect(text).toContain('BẢNG SAO KÊ GIAO DỊCH TÀI CHÍNH - FINWISE');
      expect(text).toContain('Ăn tối cùng bạn bè');
      expect(text).toContain('120000.00');
    });

    it('buildExcelBuffer should produce valid XLSX buffer with 4 sheets', async () => {
      const buffer = await buildExcelBuffer(mockRows, mockSummary, 'Pass1234');
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(1000);

      // Verify Excel file signature (PK zip header)
      expect(buffer[0]).toBe(0x50); // 'P'
      expect(buffer[1]).toBe(0x4B); // 'K'
    });

    it('buildPdfBuffer should produce valid PDF buffer with %PDF header', async () => {
      const buffer = await buildPdfBuffer(
        mockRows,
        mockSummary,
        'FW-TEST-VERIFY-001',
        'http://localhost:7777/api/v1/statements/verify/FW-TEST-VERIFY-001',
        'Pass1234',
      );
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(1000);

      // Verify PDF file signature (%PDF-)
      const header = buffer.subarray(0, 5).toString('ascii');
      expect(header).toBe('%PDF-');
    });
  });
});
