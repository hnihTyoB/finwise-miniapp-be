import request from 'supertest';
import bcrypt from 'bcryptjs';
import { Prisma, TransactionType } from '@prisma/client';
import app from '../src/app';
import { prisma } from '../src/database/prisma.client';
import { QueryParser, UserEntityContext } from '../src/modules/query/query-parser';

describe('Upgrade 5: Hybrid Natural Language to Deterministic DSL Query Engine', () => {
  describe('QueryParser Unit Tests', () => {
    const mockContext: UserEntityContext = {
      categories: [
        { id: 'cat-1', name: 'Ăn uống' },
        { id: 'cat-2', name: 'Mua sắm' },
        { id: 'cat-3', name: 'Tiền nhà' },
      ],
      wallets: [
        { id: 'wal-1', name: 'Ví Tiền Mặt' },
        { id: 'wal-2', name: 'Techcombank' },
      ],
    };

    it('should parse natural Vietnamese queries into deterministic AST with category matching', () => {
      const ast = QueryParser.parse('Tổng chi tiêu ăn uống tháng này', mockContext);

      expect(ast.timeRange.type).toBe('THIS_MONTH');
      expect(ast.transactionType).toBe('EXPENSE');
      expect(ast.aggregation).toBe('SUM');
      expect(ast.categoryNames).toContain('Ăn uống');
      expect(ast.categoryIds).toContain('cat-1');
    });

    it('should parse temporal bounds, amount filters, and grouping', () => {
      const ast = QueryParser.parse(
        'Liệt kê chi tiêu trên 500k theo danh mục trong 30 ngày qua',
        mockContext,
      );

      expect(ast.timeRange.type).toBe('LAST_30_DAYS');
      expect(ast.aggregation).toBe('LIST');
      expect(ast.groupBy).toBe('CATEGORY');
      expect(ast.amountFilter?.minAmount).toBe(500000);
    });

    it('should parse income queries with specific wallet matching', () => {
      const ast = QueryParser.parse('Tổng thu nhập vào Techcombank tháng trước', mockContext);

      expect(ast.timeRange.type).toBe('LAST_MONTH');
      expect(ast.transactionType).toBe('INCOME');
      expect(ast.walletNames).toContain('Techcombank');
      expect(ast.walletIds).toContain('wal-2');
    });
  });

  describe('Query API Integration Tests', () => {
    let testUserId: string;
    let testWalletId: string;
    let testCategoryId: string;
    let authHeader: string;

    beforeAll(async () => {
      const defaultRole = await prisma.role.findUnique({ where: { name: 'USER' } });
      const password = 'Password@123456';
      const passwordHash = await bcrypt.hash(password, 10);
      const email = `dsl.query.test.${Date.now()}@example.com`;

      const user = await prisma.user.create({
        data: {
          email,
          password: passwordHash,
          fullName: 'DSL Query Test User',
          isActive: true,
          roleId: defaultRole!.id,
        },
      });
      testUserId = user.id;

      const wallet = await prisma.wallet.create({
        data: {
          userId: testUserId,
          name: 'Techcombank DSL',
          currency: 'VND',
          balance: new Prisma.Decimal(10000000),
          isDefault: true,
        },
      });
      testWalletId = wallet.id;

      const category = await prisma.category.create({
        data: {
          userId: testUserId,
          name: 'Ăn uống DSL',
          type: TransactionType.EXPENSE,
        },
      });
      testCategoryId = category.id;

      const now = new Date();
      // Create 3 expense transactions in current month
      await prisma.transaction.createMany({
        data: [
          {
            userId: testUserId,
            walletId: testWalletId,
            categoryId: testCategoryId,
            amount: new Prisma.Decimal(150000),
            type: TransactionType.EXPENSE,
            description: 'Bữa trưa phở',
            date: now,
          },
          {
            userId: testUserId,
            walletId: testWalletId,
            categoryId: testCategoryId,
            amount: new Prisma.Decimal(250000),
            type: TransactionType.EXPENSE,
            description: 'Bữa tối lẩu',
            date: now,
          },
          {
            userId: testUserId,
            walletId: testWalletId,
            categoryId: testCategoryId,
            amount: new Prisma.Decimal(50000),
            type: TransactionType.EXPENSE,
            description: 'Cafe chiều',
            date: now,
          },
        ],
      });

      // Login
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email, password });

      authHeader = `Bearer ${loginRes.body.data.accessToken}`;
    });

    afterAll(async () => {
      await prisma.transaction.deleteMany({ where: { userId: testUserId } });
      await prisma.category.deleteMany({ where: { userId: testUserId } });
      await prisma.wallet.deleteMany({ where: { userId: testUserId } });
      await prisma.user.deleteMany({ where: { id: testUserId } });
    });

    it('POST /api/v1/query/parse should return deterministic AST', async () => {
      const res = await request(app)
        .post('/api/v1/query/parse')
        .set('Authorization', authHeader)
        .send({
          query: 'Tổng chi tiêu Ăn uống DSL tháng này',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.ast.transactionType).toBe('EXPENSE');
      expect(res.body.data.ast.categoryNames).toContain('Ăn uống DSL');
    });

    it('POST /api/v1/query/execute should compute deterministic summary metrics', async () => {
      const res = await request(app)
        .post('/api/v1/query/execute')
        .set('Authorization', authHeader)
        .send({
          query: 'Tổng chi tiêu Ăn uống DSL tháng này',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.count).toBe(3);
      expect(parseFloat(res.body.data.totalValue)).toBeCloseTo(450000, 0);
      expect(parseFloat(res.body.data.average)).toBeCloseTo(150000, 0);
      expect(res.body.data.summary).toContain('450.000 VND');
    });
  });
});
