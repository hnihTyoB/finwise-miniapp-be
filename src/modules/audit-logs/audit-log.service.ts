import { AuditLogQueryDto, CreateAuditLogDto } from './audit-log.dto';
import { auditLogRepository, AuditLogRepository } from './audit-log.repository';

export class AuditLogService {
  constructor(private readonly repository: AuditLogRepository = auditLogRepository) {}

  async findAllAuditLogs(query: AuditLogQueryDto) {
    return this.repository.findAllAuditLogs(query);
  }

  async createAuditLog(data: CreateAuditLogDto) {
    return this.repository.createAuditLog(data);
  }
}

export const auditLogService = new AuditLogService();
