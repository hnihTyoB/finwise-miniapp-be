import { Request, Response, NextFunction } from 'express';
import { envConfig } from '../config/env.config';
import { cacheService } from '../common/services/cache.service';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const requestCounts = new Map<string, RateLimitRecord>();
let lastCleanupAt = 0;

export async function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const maxRequests = envConfig.rateLimit.maxRequests;
  const windowMs = envConfig.rateLimit.windowMs;

  const isUsingRedis = cacheService.isUsingRedis();
  const redisClient = cacheService.getRedisClient();

  if (isUsingRedis && redisClient) {
    try {
      const redisKey = `finwise:rate-limit:${ip}`;
      const currentCount = await redisClient.incr(redisKey);
      
      if (currentCount === 1) {
        await redisClient.pexpire(redisKey, windowMs);
      }
      
      if (currentCount > maxRequests) {
        const ttlMs = await redisClient.pttl(redisKey);
        const retryAfterSeconds = Math.max(1, Math.ceil(ttlMs / 1000));
        res.setHeader('Retry-After', retryAfterSeconds.toString());
        res.status(429).json({
          success: false,
          message: 'Too many requests, please try again later',
          code: 'RATE_LIMIT_EXCEEDED',
        });
        return;
      }
      
      next();
      return;
    } catch (error) {
      // In case of Redis failure, fall back to memory rate limiting silently
      console.error('Redis rate limiting failed. Falling back to memory rate limiting.', error);
    }
  }

  // Memory-safe rate limit fallback
  if (now - lastCleanupAt >= windowMs) {
    requestCounts.forEach((record, key) => {
      if (now >= record.resetAt) {
        requestCounts.delete(key);
      }
    });
    lastCleanupAt = now;
  }

  const record = requestCounts.get(ip);

  if (!record || now >= record.resetAt) {
    requestCounts.set(ip, {
      count: 1,
      resetAt: now + windowMs,
    });
    next();
    return;
  }

  record.count += 1;

  if (record.count > maxRequests) {
    const retryAfterSeconds = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
    res.setHeader('Retry-After', retryAfterSeconds.toString());
    res.status(429).json({
      success: false,
      message: 'Too many requests, please try again later',
      code: 'RATE_LIMIT_EXCEEDED',
    });
    return;
  }

  next();
}

export function createRateLimiter(options: {
  maxRequests: number;
  windowMs: number;
  keyPrefix: string;
  message?: string;
}) {
  const localCounts = new Map<string, RateLimitRecord>();
  let localLastCleanup = 0;

  return async function rateLimiter(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (process.env.NODE_ENV === 'test') {
      next();
      return;
    }
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const { maxRequests, windowMs, keyPrefix, message = 'Too many requests, please try again later' } = options;

    const isUsingRedis = cacheService.isUsingRedis();
    const redisClient = cacheService.getRedisClient();

    if (isUsingRedis && redisClient) {
      try {
        const redisKey = `finwise:${keyPrefix}:${ip}`;
        const currentCount = await redisClient.incr(redisKey);
        if (currentCount === 1) {
          await redisClient.pexpire(redisKey, windowMs);
        }
        if (currentCount > maxRequests) {
          const ttlMs = await redisClient.pttl(redisKey);
          const retryAfterSeconds = Math.max(1, Math.ceil(ttlMs / 1000));
          res.setHeader('Retry-After', retryAfterSeconds.toString());
          res.status(429).json({
            success: false,
            message,
            code: 'RATE_LIMIT_EXCEEDED',
          });
          return;
        }
        next();
        return;
      } catch (error) {
        console.error(`Redis rate limiting failed for ${keyPrefix}. Falling back to memory.`, error);
      }
    }

    if (now - localLastCleanup >= windowMs) {
      localCounts.forEach((rec, key) => {
        if (now >= rec.resetAt) localCounts.delete(key);
      });
      localLastCleanup = now;
    }

    const record = localCounts.get(ip);
    if (!record || now >= record.resetAt) {
      localCounts.set(ip, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    record.count += 1;
    if (record.count > maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
      res.setHeader('Retry-After', retryAfterSeconds.toString());
      res.status(429).json({
        success: false,
        message,
        code: 'RATE_LIMIT_EXCEEDED',
      });
      return;
    }

    next();
  };
}

export const authRateLimitMiddleware = createRateLimiter({
  maxRequests: 20,
  windowMs: 15 * 60 * 1000,
  keyPrefix: 'rate-limit:auth',
  message: 'Quá nhiều yêu cầu xác thực từ IP này. Vui lòng thử lại sau 15 phút.',
});

