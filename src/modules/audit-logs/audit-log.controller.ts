import { Request, Response, NextFunction } from 'express';
import { AuditLogQueryDto } from './audit-log.dto';
import { auditLogService, AuditLogService } from './audit-log.service';
import { auditLogArchiveService, AuditLogArchiveService } from './audit-log-archive.service';

export class AuditLogController {
  constructor(
    private readonly service: AuditLogService = auditLogService,
    private readonly archiveService: AuditLogArchiveService = auditLogArchiveService,
  ) {}

  findAllAuditLogs = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query as unknown as AuditLogQueryDto;
      const result = await this.service.findAllAuditLogs(query);
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  archiveAndCleanupAuditLogs = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { retentionDays } = req.body || {};
      const actorId = (req as any).user?.id;
      const result = await this.archiveService.archiveAndCleanup({
        retentionDays: retentionDays ? Number(retentionDays) : undefined,
        actorId,
        triggerSource: 'MANUAL',
      });
      res.json({
        success: true,
        message:
          result.archivedCount > 0
            ? `Đã lưu trữ và dọn dẹp ${result.archivedCount} bản ghi kiểm toán cũ hơn ${result.retentionDays} ngày.`
            : `Không có bản ghi kiểm toán nào cũ hơn ${result.retentionDays} ngày.`,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const auditLogController = new AuditLogController();
