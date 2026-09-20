import { uuidv7 } from '../helpers/uuid.helper';
import { cacheService } from './cache.service';
import { LoggerService } from './logger.service';

interface LocalLock {
  token: string;
  expiresAt: number;
}

export class LockService {
  private readonly logger = new LoggerService('LockService');
  private readonly localLocks = new Map<string, LocalLock>();

  /**
   * Acquires a lock with an owner token.
   * @param lockKey Key of the lock (e.g. "finwise:lock:notification-worker")
   * @param ttlMs Time-to-live for the lock in milliseconds
   * @param customToken Optional custom token (a random UUID is generated if omitted)
   * @returns lock token string if acquired successfully, null otherwise
   */
  async acquire(lockKey: string, ttlMs: number, customToken?: string): Promise<string | null> {
    const token = customToken || uuidv7();
    const isUsingRedis = cacheService.isUsingRedis();
    const redisClient = cacheService.getRedisClient();

    if (isUsingRedis && redisClient) {
      try {
        const result = await redisClient.set(lockKey, token, 'PX', ttlMs, 'NX');
        return result === 'OK' ? token : null;
      } catch (error) {
        this.logger.error(`Redis error acquiring lock for key "${lockKey}":`, error);
        // Fallback to local lock simulation
      }
    }

    // Fallback: Local In-Memory Lock simulation
    const now = Date.now();
    const existing = this.localLocks.get(lockKey);

    if (existing && now < existing.expiresAt) {
      // Lock is still active/held
      return null;
    }

    // Set lock
    this.localLocks.set(lockKey, { token, expiresAt: now + ttlMs });
    return token;
  }

  /**
   * Releases a lock safely only if the token matches the owner.
   * @param lockKey Key of the lock
   * @param lockToken Token received when acquiring the lock
   */
  async release(lockKey: string, lockToken?: string): Promise<boolean> {
    const isUsingRedis = cacheService.isUsingRedis();
    const redisClient = cacheService.getRedisClient();

    if (isUsingRedis && redisClient) {
      try {
        if (lockToken) {
          const luaScript = `
            if redis.call("get", KEYS[1]) == ARGV[1] then
              return redis.call("del", KEYS[1])
            else
              return 0
            end
          `;
          const result = await redisClient.eval(luaScript, 1, lockKey, lockToken);
          return result === 1;
        }
        await redisClient.del(lockKey);
        return true;
      } catch (error) {
        this.logger.error(`Redis error releasing lock for key "${lockKey}":`, error);
        return false;
      }
    }

    const existing = this.localLocks.get(lockKey);
    if (!existing) {
      return false;
    }

    if (lockToken && existing.token !== lockToken) {
      return false;
    }

    this.localLocks.delete(lockKey);
    return true;
  }
}

export const lockService = new LockService();
