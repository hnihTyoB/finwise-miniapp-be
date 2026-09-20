export interface AuditLogQueryDto {
  actorId?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  order?: 'asc' | 'desc';
}

export interface CreateAuditLogDto {
  actorId?: string;
  action: string;
  targetType: string;
  targetId?: string;
  previousState?: any;
  newState?: any;
  ipAddress?: string;
  userAgent?: string;
}

export interface ArchiveCleanupAuditLogDto {
  retentionDays?: number;
}
