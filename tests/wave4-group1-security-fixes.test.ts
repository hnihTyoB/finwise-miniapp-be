jest.unmock('../src/common/services/mail.service');
import type { MailService } from '../src/common/services/mail.service';
const { MailService: ActualMailService } = jest.requireActual('../src/common/services/mail.service');
import { statementQueueService } from '../src/modules/statements/statement-queue.service';
import { webhookQueueService } from '../src/modules/webhooks/webhook-queue.service';
import { mailConfig } from '../src/config/mail.config';
import { archiveCleanupAuditLogSchema } from '../src/modules/audit-logs/audit-log.validation';
import { PERMISSIONS } from '../src/common/constants';
import { StatementRepository } from '../src/modules/statements/statement.repository';
import { prisma } from '../src/database/prisma.client';
import { WebhookDeliveryStatus } from '@prisma/client';

describe('Wave 4 Group 1 Security Fixes', () => {
  describe('SEC-W4-01: Statement Export Worker BullMQ Queue Poisoning Prevention', () => {
    let updateStatusSpy: jest.SpyInstance;

    beforeEach(() => {
      updateStatusSpy = jest
        .spyOn(StatementRepository.prototype, 'updateStatus')
        .mockResolvedValue({} as any);
    });

    afterEach(() => {
      updateStatusSpy.mockRestore();
    });

    it('should drop completely malformed or missing payload without crashing or throwing', async () => {
      const malformedPayloads = [null, undefined, {}, { statementJobId: 'job-1' }, { userId: 'u-1' }];
      for (const payload of malformedPayloads) {
        await expect(
          (statementQueueService as any).processExportJob(payload),
        ).resolves.not.toThrow();
      }
    });

    it('should handle invalid dateFrom/dateTo without throwing RangeError: Invalid time value', async () => {
      const invalidDatePayload: any = {
        statementJobId: 'job-invalid-date-1',
        userId: 'user-1',
        dateFrom: 'not-a-real-date',
        dateTo: 'invalid-date',
        format: 'PDF',
        verificationCode: 'ABC12345',
      };

      await expect(
        (statementQueueService as any).processExportJob(invalidDatePayload),
      ).resolves.not.toThrow();

      expect(updateStatusSpy).toHaveBeenCalledWith(
        'job-invalid-date-1',
        'FAILED',
        expect.objectContaining({
          error: expect.stringContaining('Khoảng thời gian'),
        }),
      );
    });

    it('should reject dateFrom > dateTo without crashing', async () => {
      const invertedDatePayload: any = {
        statementJobId: 'job-inverted-date',
        userId: 'user-1',
        dateFrom: '2026-12-31',
        dateTo: '2026-01-01',
        format: 'PDF',
        verificationCode: 'ABC12345',
      };

      await expect(
        (statementQueueService as any).processExportJob(invertedDatePayload),
      ).resolves.not.toThrow();

      expect(updateStatusSpy).toHaveBeenCalledWith(
        'job-inverted-date',
        'FAILED',
        expect.objectContaining({
          error: expect.stringContaining('Khoảng thời gian'),
        }),
      );
    });

    it('should reject unsupported export format safely', async () => {
      const badFormatPayload: any = {
        statementJobId: 'job-bad-format',
        userId: 'user-1',
        dateFrom: '2026-01-01',
        dateTo: '2026-01-31',
        format: 'EXE_FORMAT',
        verificationCode: 'ABC12345',
      };

      await expect(
        (statementQueueService as any).processExportJob(badFormatPayload),
      ).resolves.not.toThrow();

      expect(updateStatusSpy).toHaveBeenCalledWith(
        'job-bad-format',
        'FAILED',
        expect.objectContaining({
          error: expect.stringContaining('Định dạng xuất không được hỗ trợ'),
        }),
      );
    });
  });

  describe('SEC-W4-02: Webhook Queue Starvation & Unrecoverable Retry Loop Prevention', () => {
    let updateWebhookDeliverySpy: jest.SpyInstance;

    beforeEach(() => {
      updateWebhookDeliverySpy = jest
        .spyOn(prisma.webhookDelivery, 'update')
        .mockResolvedValue({} as any);
    });

    afterEach(() => {
      updateWebhookDeliverySpy.mockRestore();
    });

    it('should drop malformed job data without throwing', async () => {
      await expect(
        webhookQueueService.processJob(null as any, 1),
      ).resolves.not.toThrow();

      await expect(
        webhookQueueService.processJob({ deliveryId: 'd-1' } as any, 1),
      ).resolves.not.toThrow();
    });

    it('should handle unrecoverable decryption error without rethrowing to BullMQ', async () => {
      const poisonedJobData = {
        deliveryId: 'delivery-uuid-1',
        webhookEndpointId: 'endpoint-1',
        url: 'https://example.com/webhook',
        secretEncrypted: 'corrupted-secret-ciphertext-that-fails-decryption',
        event: 'transaction.created',
        eventId: 'evt-1',
        payload: { amount: 1000 },
      };

      // Must resolve without throwing so BullMQ does NOT retry 5 times
      await expect(
        webhookQueueService.processJob(poisonedJobData, 1),
      ).resolves.not.toThrow();

      expect(updateWebhookDeliverySpy).toHaveBeenCalledWith({
        where: { id: 'delivery-uuid-1' },
        data: expect.objectContaining({
          status: WebhookDeliveryStatus.FAILED,
          errorMessage: expect.stringContaining('Decryption error'),
        }),
      });
    });
  });

  describe('SEC-W4-03: Sensitive Auth Credential Leakage Prevention in Logs', () => {
    const originalEnv = process.env.NODE_ENV;
    let warnSpy: jest.SpyInstance;
    let errorSpy: jest.SpyInstance;
    let isConfiguredSpy: jest.SpyInstance;
    let mailService: MailService;

    beforeEach(() => {
      process.env.NODE_ENV = 'production';
      warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      isConfiguredSpy = jest.spyOn(mailConfig, 'isConfigured', 'get').mockReturnValue(true);
      mailService = new ActualMailService();
    });

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
      warnSpy.mockRestore();
      errorSpy.mockRestore();
      isConfiguredSpy.mockRestore();
    });

    it('should never log password reset token / resetUrl when dispatch fails in production', async () => {
      (mailService as any).dispatchEmail = jest.fn().mockRejectedValue(new Error('SMTP connection timeout'));

      const sensitiveToken = 'super-secret-password-reset-token-998877';
      await expect(
        mailService.sendPasswordResetEmail('victim@finwise.app', sensitiveToken, 'Victim User'),
      ).rejects.toThrow('SMTP connection timeout');

      // Verify sensitive token never appeared in stdout/stderr logs
      for (const call of warnSpy.mock.calls) {
        expect(call.join(' ')).not.toContain(sensitiveToken);
      }
      for (const call of errorSpy.mock.calls) {
        expect(call.join(' ')).not.toContain(sensitiveToken);
      }
    });

    it('should never log handover OTP code when dispatch fails in production', async () => {
      (mailService as any).dispatchEmail = jest.fn().mockRejectedValue(new Error('Mail service down'));

      const sensitiveOtp = '987654';
      await mailService.sendHandoverOtpEmail('victim@finwise.app', sensitiveOtp, {
        targetUserName: 'New Owner',
        expiresInMinutes: 15,
      });

      // Verify sensitive OTP code never appeared in stdout/stderr logs
      for (const call of warnSpy.mock.calls) {
        expect(call.join(' ')).not.toContain(sensitiveOtp);
      }
      for (const call of errorSpy.mock.calls) {
        expect(call.join(' ')).not.toContain(sensitiveOtp);
      }
    });

    it('should never log verification token when dispatch fails in production', async () => {
      (mailService as any).dispatchEmail = jest.fn().mockRejectedValue(new Error('Connection error'));

      const verificationToken = 'verify-secret-token-112233';
      await expect(
        mailService.sendVerificationEmail('victim@finwise.app', verificationToken, 'Victim User'),
      ).rejects.toThrow('Connection error');

      for (const call of warnSpy.mock.calls) {
        expect(call.join(' ')).not.toContain(verificationToken);
      }
      for (const call of errorSpy.mock.calls) {
        expect(call.join(' ')).not.toContain(verificationToken);
      }
    });

    it('should not log credentials when provider is not configured in production', async () => {
      isConfiguredSpy.mockReturnValue(false);

      const sensitiveToken = 'unconfigured-secret-token-123';
      const sensitiveOtp = '654321';

      await mailService.sendPasswordResetEmail('test@finwise.app', sensitiveToken);
      await mailService.sendHandoverOtpEmail('test@finwise.app', sensitiveOtp, {
        targetUserName: 'Target',
        expiresInMinutes: 10,
      });
      await mailService.sendVerificationEmail('test@finwise.app', sensitiveToken);

      for (const call of warnSpy.mock.calls) {
        expect(call.join(' ')).not.toContain(sensitiveToken);
        expect(call.join(' ')).not.toContain(sensitiveOtp);
      }
    });
  });

  describe('SEC-W4-04: Audit Logs Cleanup Broken Access Control & Retention Limit', () => {
    it('should reject retentionDays under 30 days in archiveCleanupAuditLogSchema', () => {
      const dangerousInputs = [
        { retentionDays: 1 },
        { retentionDays: 7 },
        { retentionDays: 29 },
        { retentionDays: 0 },
        { retentionDays: -5 },
      ];

      for (const input of dangerousInputs) {
        const parsed = archiveCleanupAuditLogSchema.safeParse(input);
        expect(parsed.success).toBe(false);
      }

      // Safe inputs must be accepted
      const safeInputs = [{ retentionDays: 30 }, { retentionDays: 90 }, { retentionDays: 365 }, {}];
      for (const input of safeInputs) {
        const parsed = archiveCleanupAuditLogSchema.safeParse(input);
        expect(parsed.success).toBe(true);
      }
    });

    it('should define AUDIT_LOG_ARCHIVE in system permissions', () => {
      expect((PERMISSIONS as any).AUDIT_LOG_ARCHIVE).toBe('AUDIT_LOG_ARCHIVE');
    });
  });
});
