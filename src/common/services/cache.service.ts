import Redis from 'ioredis';
import { envConfig } from '../../config/env.config';
import { LoggerService } from './logger.service';

interface CacheEntry {
  value: any;
  expiresAt: number | null;
}

export class CacheService {
  private readonly logger = new LoggerService('CacheService');
  private redis: Redis | null = null;
  private isRedisConnected = false;
  
  // In-Memory Fallback Cache
  private readonly memoryCache = new Map<string, CacheEntry>();
  private readonly maxMemoryKeys = 1000;
  private memoryCleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    if (envConfig.redis.enabled) {
      this.initRedis();
    } else {
      this.logger.info('Redis is disabled, using in-memory cache fallback.');
      this.initMemoryCleanup();
    }
  }

  private initRedis() {
    try {
      const retryStrategy = (times: number) => {
        if (times > 3) {
          this.logger.warn('Failed to connect to Redis. Falling back to in-memory cache.');
          this.isRedisConnected = false;
          this.redis?.disconnect();
          this.initMemoryCleanup();
          return null;
        }
        return Math.min(times * 100, 2000);
      };

      if (envConfig.redis.url) {
        this.redis = new Redis(envConfig.redis.url, {
          lazyConnect: true,
          maxRetriesPerRequest: 3,
          retryStrategy,
        });
      } else {
        this.redis = new Redis({
          host: envConfig.redis.host,
          port: envConfig.redis.port,
          password: envConfig.redis.password,
          lazyConnect: true,
          maxRetriesPerRequest: 3,
          retryStrategy,
        });
      }

      this.redis.on('connect', () => {
        this.logger.info('Successfully connected to Redis.');
        this.isRedisConnected = true;
        this.stopMemoryCleanup();
      });

      this.redis.on('error', (err) => {
        this.logger.error('Redis error occurred:', err);
        this.isRedisConnected = false;
        this.initMemoryCleanup();
      });

      this.redis.on('close', () => {
        this.logger.warn('Redis connection closed.');
        this.isRedisConnected = false;
        this.initMemoryCleanup();
      });

      // Async connect in background
      this.redis.connect().catch((err) => {
        this.logger.error('Error during initial Redis connection:', err);
        this.isRedisConnected = false;
        this.initMemoryCleanup();
      });
    } catch (error) {
      this.logger.error('Failed to initialize Redis client. Falling back to in-memory.', error);
      this.isRedisConnected = false;
      this.initMemoryCleanup();
    }
  }

  private initMemoryCleanup() {
    if (this.memoryCleanupInterval) return;
    
    // Prune expired entries every 5 minutes
    this.memoryCleanupInterval = setInterval(() => {
      this.pruneMemoryCache();
    }, 5 * 60 * 1000);
    
    // Allow the process to exit if only this timer is running
    this.memoryCleanupInterval.unref();
  }

  private stopMemoryCleanup() {
    if (this.memoryCleanupInterval) {
      clearInterval(this.memoryCleanupInterval);
      this.memoryCleanupInterval = null;
    }
  }

  private pruneMemoryCache() {
    const now = Date.now();
    let prunedCount = 0;
    
    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.expiresAt !== null && now > entry.expiresAt) {
        this.memoryCache.delete(key);
        prunedCount++;
      }
    }
    
    if (prunedCount > 0) {
      this.logger.debug(`Pruned ${prunedCount} expired entries from in-memory cache.`);
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (this.isRedisConnected && this.redis) {
      try {
        const data = await this.redis.get(key);
        if (!data) return null;
        return JSON.parse(data) as T;
      } catch (error) {
        this.logger.error(`Error getting key "${key}" from Redis:`, error);
        // Fallback to memory read in case Redis query fails
      }
    }

    // In-memory read
    const entry = this.memoryCache.get(key);
    if (!entry) return null;

    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.memoryCache.delete(key);
      return null;
    }

    return entry.value as T;
  }

  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    if (this.isRedisConnected && this.redis) {
      try {
        const serialized = JSON.stringify(value);
        if (ttlSeconds && ttlSeconds > 0) {
          await this.redis.set(key, serialized, 'EX', ttlSeconds);
        } else {
          await this.redis.set(key, serialized);
        }
        return;
      } catch (error) {
        this.logger.error(`Error setting key "${key}" in Redis:`, error);
        // Fallback to memory set
      }
    }

    // In-memory write
    if (this.memoryCache.size >= this.maxMemoryKeys) {
      // Evict first key (FIFO approximation since JS Map maintains insertion order)
      const firstKey = this.memoryCache.keys().next().value;
      if (firstKey !== undefined) {
        this.memoryCache.delete(firstKey);
      }
    }

    const expiresAt = ttlSeconds && ttlSeconds > 0 
      ? Date.now() + ttlSeconds * 1000 
      : null;

    this.memoryCache.set(key, { value, expiresAt });
  }

  async del(key: string): Promise<void> {
    if (this.isRedisConnected && this.redis) {
      try {
        await this.redis.del(key);
        return;
      } catch (error) {
        this.logger.error(`Error deleting key "${key}" in Redis:`, error);
      }
    }

    this.memoryCache.delete(key);
  }

  /**
   * Clears all keys matching a pattern (e.g. "finwise:cache:reports:userId:*")
   */
  async clearPattern(pattern: string): Promise<void> {
    this.logger.debug(`Clearing cache pattern: ${pattern}`);
    
    if (this.isRedisConnected && this.redis) {
      try {
        // Convert glob pattern if needed (Redis keys matching uses glob syntax out of the box)
        let cursor = '0';
        do {
          const [nextCursor, keys] = await this.redis.scan(
            cursor,
            'MATCH',
            pattern,
            'COUNT',
            100
          );
          cursor = nextCursor;
          
          if (keys.length > 0) {
            await this.redis.del(...keys);
          }
        } while (cursor !== '0');
        
        return;
      } catch (error) {
        this.logger.error(`Error scanning/deleting keys matching "${pattern}" in Redis:`, error);
      }
    }

    // In-memory pattern clear
    // Convert glob pattern to RegExp: escape special characters, replace * with .*
    const regexPattern = new RegExp(
      '^' + pattern.replace(/[-/\\^$+.()|[\]{}]/g, '\\$&').replace(/\*/g, '.*') + '$'
    );

    for (const key of this.memoryCache.keys()) {
      if (regexPattern.test(key)) {
        this.memoryCache.delete(key);
      }
    }
  }

  // Get raw client connection (for health check / monitoring)
  getRedisClient() {
    return this.redis;
  }

  isUsingRedis(): boolean {
    return this.isRedisConnected;
  }
}

export const cacheService = new CacheService();
