import { notificationStreamService, MAX_SSE_CONNECTIONS_PER_USER } from '../src/modules/notifications/notification-stream.service';
import { NotificationController } from '../src/modules/notifications/notification.controller';
import { QueryCompiler } from '../src/modules/query/query-compiler';
import { executeQuerySchema } from '../src/modules/query/query.validation';
import { ForecastMathEngine, DailyBucket } from '../src/modules/forecast/forecast-math';
import { createJobSchema, ALLOWED_JOB_TYPES } from '../src/modules/jobs/job.validation';
import { jobService } from '../src/modules/jobs/job.service';
import { JobRepository } from '../src/modules/jobs/job.repository';
import { Prisma } from '@prisma/client';
import { prisma } from '../src/database/prisma.client';
import { AppError } from '../src/common/errors/app-error';

describe('Wave 4 Group 2 Security Fixes', () => {
  describe('SEC-W4-05: Server-Sent Events (SSE) Socket Exhaustion DoS Defense', () => {
    let mockReq: any;
    let mockRes: any;
    const testUserId = '01a0b566-b93e-7991-92d9-7103c9753001';

    beforeEach(() => {
      mockReq = {
        user: { id: testUserId },
        on: jest.fn(),
      };
      mockRes = {
        writeHead: jest.fn(),
        flushHeaders: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        on: jest.fn(),
      };
      // Clear all active connections
      notificationStreamService.shutdown();
    });

    afterEach(() => {
      notificationStreamService.shutdown();
    });

    it('should allow up to 5 concurrent SSE connections for a single user', async () => {
      for (let i = 0; i < MAX_SSE_CONNECTIONS_PER_USER; i++) {
        const res = { ...mockRes, write: jest.fn(), end: jest.fn() };
        await notificationStreamService.registerClient(testUserId, res as any, mockReq);
      }
      expect(notificationStreamService.getActiveConnectionCount(testUserId)).toBe(5);
    });

    it('should reject 6th concurrent SSE connection via registerClient and close socket', async () => {
      for (let i = 0; i < MAX_SSE_CONNECTIONS_PER_USER; i++) {
        const res = { ...mockRes, write: jest.fn(), end: jest.fn() };
        await notificationStreamService.registerClient(testUserId, res as any, mockReq);
      }

      const excessRes: any = {
        write: jest.fn(),
        end: jest.fn(),
        on: jest.fn(),
      };

      await notificationStreamService.registerClient(testUserId, excessRes, mockReq);
      expect(excessRes.write).toHaveBeenCalledWith(
        expect.stringContaining('Too many concurrent SSE connections'),
      );
      expect(excessRes.end).toHaveBeenCalled();
      expect(notificationStreamService.getActiveConnectionCount(testUserId)).toBe(5);
    });

    it('should reject stream in NotificationController with HTTP 429 when max connections reached', async () => {
      for (let i = 0; i < MAX_SSE_CONNECTIONS_PER_USER; i++) {
        const res = { ...mockRes, write: jest.fn(), end: jest.fn() };
        await notificationStreamService.registerClient(testUserId, res as any, mockReq);
      }

      const controller = new NotificationController();
      const nextFn = jest.fn();

      await controller.stream(mockReq, mockRes, nextFn);
      expect(nextFn).toHaveBeenCalledWith(expect.any(AppError));
      const error: AppError = nextFn.mock.calls[0][0];
      expect(error.statusCode).toBe(429);
      expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
    });
  });

  describe('SEC-W4-06: Potential XSS & HTML Injection via DSL Query Entity Names Defense', () => {
    it('should escape HTML characters in categoryNames and walletNames within summary', async () => {
      // Mock prisma transaction aggregate and findMany
      jest.spyOn(prisma.transaction, 'aggregate').mockResolvedValue({
        _sum: { amount: new Prisma.Decimal(500000) },
        _count: { id: 2 },
        _avg: { amount: new Prisma.Decimal(250000) },
        _min: { amount: new Prisma.Decimal(200000) },
        _max: { amount: new Prisma.Decimal(300000) },
      } as any);

      jest.spyOn(prisma.transaction, 'groupBy').mockResolvedValue([
        { walletId: 'w-1', _sum: { amount: new Prisma.Decimal(500000) }, _count: { id: 2 } },
      ] as any);

      jest.spyOn(prisma.wallet, 'findMany').mockResolvedValue([
        { id: 'w-1', name: 'Ví Chính', currency: 'VND' },
      ] as any);

      jest.spyOn(prisma.transaction, 'findMany').mockResolvedValue([] as any);

      const xssAst: any = {
        timeRange: { type: 'THIS_MONTH' },
        transactionType: 'EXPENSE',
        aggregation: 'SUM',
        groupBy: 'NONE',
        categoryNames: ['<script>alert("xss")</script>', 'Ăn uống & Cà phê'],
        walletNames: ['<img src=x onerror=alert(1)>', 'Ví Momo" onload="evil()'],
      };

      const result = await QueryCompiler.execute('01a0b566-b93e-7991-92d9-7103c9753002', xssAst);
      expect(result.summary).not.toContain('<script>');
      expect(result.summary).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
      expect(result.summary).toContain('&amp;');
    });

    it('should validate and constrain categoryNames and walletNames in executeQuerySchema', () => {
      const oversizedName = 'A'.repeat(51);
      const invalidInput = {
        ast: {
          timeRange: { type: 'THIS_MONTH' },
          categoryNames: [oversizedName],
        },
      };
      const result = executeQuerySchema.safeParse(invalidInput);
      expect(result.success).toBe(false);

      const tooManyCategories = {
        ast: {
          timeRange: { type: 'THIS_MONTH' },
          categoryNames: Array.from({ length: 21 }, (_, i) => `Cat ${i}`),
        },
      };
      const result2 = executeQuerySchema.safeParse(tooManyCategories);
      expect(result2.success).toBe(false);
    });
  });

  describe('SEC-W4-07: Financial Runway Math RangeError DoS Defense', () => {
    it('should not throw RangeError: Invalid time value when netDailyFlow is infinitesimal', () => {
      const currentBalance = new Prisma.Decimal(10000000); // 10 million VND
      // Infinitesimal expense creates an almost zero burn rate
      const dailyBuckets: DailyBucket[] = [
        {
          date: '2026-11-01' as any,
          income: new Prisma.Decimal(0),
          expense: new Prisma.Decimal('0.00000001'),
        },
      ];

      expect(() => {
        const result = ForecastMathEngine.computeRunway(
          currentBalance,
          dailyBuckets,
          30,
          '2026-11-01' as any,
          10,
        );
        expect(result.metrics.isDepletionProjected).toBe(false);
        expect(result.metrics.depletionDate).toBeNull();
        expect(result.metrics.runwayDays).toBeNull();
      }).not.toThrow();
    });

    it('should accurately calculate depletionDate when burn rate exhausts balance within 10 years', () => {
      const currentBalance = new Prisma.Decimal(3000000); // 3 million
      // Burn 100,000 VND / day -> 30 days runway
      const dailyBuckets: DailyBucket[] = [
        {
          date: '2026-11-01' as any,
          income: new Prisma.Decimal(0),
          expense: new Prisma.Decimal(100000),
        },
      ];

      const result = ForecastMathEngine.computeRunway(
        currentBalance,
        dailyBuckets,
        30,
        '2026-11-01' as any,
        10,
      );
      expect(result.metrics.isDepletionProjected).toBe(true);
      expect(result.metrics.runwayDays).toBe(30);
      expect(result.metrics.depletionDate).toBe('2026-12-01');
    });
  });

  describe('SEC-W4-08: Unbounded Async Job Spawning DoS & Type Whitelist Defense', () => {
    it('should enforce job type whitelist in createJobSchema', () => {
      expect(ALLOWED_JOB_TYPES).toContain('REPORT_EXPORT');
      expect(ALLOWED_JOB_TYPES).toContain('AI_DEEP_ANALYSIS');

      const validJob = { type: 'REPORT_EXPORT', input: { format: 'PDF' } };
      expect(createJobSchema.safeParse(validJob).success).toBe(true);

      const maliciousJob = { type: 'MALICIOUS_CUSTOM_INJECTION_TYPE', input: {} };
      const parsed = createJobSchema.safeParse(maliciousJob);
      expect(parsed.success).toBe(false);
    });

    it('should throw HTTP 429 when user exceeds max active concurrent jobs', async () => {
      jest.spyOn(JobRepository.prototype, 'countActiveJobs').mockResolvedValue(3);

      await expect(
        jobService.createJob('user-spammer-1', { type: 'REPORT_EXPORT' }),
      ).rejects.toThrow(AppError);

      await expect(
        jobService.createJob('user-spammer-1', { type: 'REPORT_EXPORT' }),
      ).rejects.toMatchObject({
        statusCode: 429,
        code: 'RATE_LIMIT_EXCEEDED',
      });
    });
  });
});
