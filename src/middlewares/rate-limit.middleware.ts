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

