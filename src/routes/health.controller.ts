import { Request, Response, NextFunction } from 'express';
import { prisma } from '../database/prisma.client';
import { cacheService } from '../common/services/cache.service';

/**
 * Public health check — chỉ trả trạng thái ok/error để load balancer dùng.
 * Không rò rỉ thông tin nội bộ (memory, DB latency, cache type).
 */
export async function healthCheck(req: Request, res: Response, _next: NextFunction): Promise<void> {
  let dbOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch (error) {
    console.error('Health check database query failed:', error);
  }

  const status = dbOk ? 'ok' : 'error';
  res.status(dbOk ? 200 : 503).json({
    success: dbOk,
    status,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Detailed health check — cần authMiddleware + quyền SYSTEM_CONFIG_READ.
 * Trả thông tin chi tiết chỉ cho admin dùng nội bộ.
 */
export async function healthCheckDetail(req: Request, res: Response, _next: NextFunction): Promise<void> {
  const timestamp = new Date().toISOString();
  const uptime = process.uptime();
  const memoryUsage = process.memoryUsage();

  let dbStatus = 'down';
  let dbLatencyMs = -1;
  const dbStart = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = 'up';
    dbLatencyMs = Date.now() - dbStart;
  } catch (error) {
    console.error('Health check database query failed:', error);
  }

  // Fix L2: phân biệt đúng trạng thái redis vs memory fallback
  const isUsingRedis = cacheService.isUsingRedis();
  const cacheType = isUsingRedis ? 'redis' : 'memory';
  const cacheStatus = 'up'; // memory fallback always up; if redis, assume up (service would fail otherwise)

  const overallStatus = dbStatus === 'up' ? 'ok' : 'error';

  res.status(overallStatus === 'ok' ? 200 : 503).json({
    success: overallStatus === 'ok',
    status: overallStatus,
    timestamp,
    uptime: Math.round(uptime * 100) / 100,
    memory: {
      rss: `${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`,
      heapTotal: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
      heapUsed: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
    },
    database: {
      status: dbStatus,
      latencyMs: dbLatencyMs,
    },
    cache: {
      status: cacheStatus,
      type: cacheType,
    },
  });
}
