import { Request, Response } from 'express';
import Redis from 'ioredis';
import { envConfig } from '../../config/env.config';
import { LoggerService } from '../../common/services/logger.service';
import { NotificationRepository } from './notification.repository';

interface SsePayload {
  userId: string;
  event: string;
  data: any;
}

export class NotificationStreamService {
  private readonly logger = new LoggerService('NotificationStreamService');
  private readonly repository = new NotificationRepository();
  private readonly clients = new Map<string, Set<Response>>();

  private publisher: Redis | null = null;
  private subscriber: Redis | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isRedisPubSubReady = false;

  constructor() {
    this.initPubSub();
    this.initHeartbeat();
  }

  private initPubSub() {
    if (!envConfig.redis.enabled) {
      this.logger.info('Redis disabled, notification stream running in standalone in-memory mode.');
      return;
    }

    try {
      const retryStrategy = (times: number) => {
        if (times > 3) {
          this.logger.warn('Failed to connect Redis for SSE Pub/Sub. Falling back to in-memory mode.');
          this.isRedisPubSubReady = false;
          return null;
        }
        return Math.min(times * 100, 2000);
      };

      const redisOptions = envConfig.redis.url
        ? { lazyConnect: true, retryStrategy }
        : {
            host: envConfig.redis.host,
            port: envConfig.redis.port,
            password: envConfig.redis.password,
            lazyConnect: true,
            retryStrategy,
          };

      this.publisher = envConfig.redis.url
        ? new Redis(envConfig.redis.url, redisOptions)
        : new Redis(redisOptions);

      this.subscriber = envConfig.redis.url
        ? new Redis(envConfig.redis.url, redisOptions)
        : new Redis(redisOptions);

      const channel = 'finwise:notifications:sse';

      this.subscriber.subscribe(channel, (err) => {
        if (err) {
          this.logger.error('Failed to subscribe to Redis SSE channel:', err);
          this.isRedisPubSubReady = false;
        } else {
          this.isRedisPubSubReady = true;
          this.logger.info(`Subscribed to Redis SSE channel "${channel}".`);
        }
      });

      this.subscriber.on('message', (_channel, message) => {
        try {
          const payload = JSON.parse(message) as SsePayload;
          if (payload?.userId && payload?.event) {
            this.sendToLocalClients(payload.userId, payload.event, payload.data);
          }
        } catch (error) {
          this.logger.error('Error processing Redis SSE message:', error);
        }
      });

      this.subscriber.on('error', (err) => {
        this.logger.warn('Redis SSE subscriber error:', err.message);
        this.isRedisPubSubReady = false;
      });

      this.publisher.on('error', (err) => {
        this.logger.warn('Redis SSE publisher error:', err.message);
        this.isRedisPubSubReady = false;
      });
    } catch (error) {
      this.logger.warn('Error setting up Redis SSE pub/sub:', error);
      this.isRedisPubSubReady = false;
    }
  }

  private initHeartbeat() {
    // Send comment ping every 25 seconds to keep connections alive through proxies
    this.heartbeatInterval = setInterval(() => {
      this.pingAll();
    }, 25_000);
    this.heartbeatInterval.unref();
  }

  private pingAll() {
    for (const [userId, userClients] of this.clients.entries()) {
      for (const client of userClients) {
        try {
          if (!client.writableEnded && !client.destroyed) {
            client.write(': ping\n\n');
          } else {
            userClients.delete(client);
          }
        } catch {
          userClients.delete(client);
        }
      }
      if (userClients.size === 0) {
        this.clients.delete(userId);
      }
    }
  }

  async registerClient(userId: string, res: Response, req: Request): Promise<void> {
    // Register response connection
    if (!this.clients.has(userId)) {
      this.clients.set(userId, new Set<Response>());
    }
    const userClients = this.clients.get(userId)!;
    userClients.add(res);

    this.logger.info(`SSE client connected for user ${userId} (active connections: ${userClients.size})`);

    // Clean up when client disconnects
    const cleanup = () => {
      const current = this.clients.get(userId);
      if (current) {
        current.delete(res);
        if (current.size === 0) {
          this.clients.delete(userId);
        }
      }
      this.logger.info(`SSE client disconnected for user ${userId}`);
    };

    if (typeof req.on === 'function') {
      req.on('close', cleanup);
    }
    if (typeof res.on === 'function') {
      res.on('error', cleanup);
    }

    // 1. Send handshake connected event
    this.writeEvent(res, 'connected', {
      connectedAt: new Date().toISOString(),
      userId,
    });

    // 2. Send current unread count immediately so client has latest state
    try {
      const count = await this.repository.unreadCount(userId);
      this.writeEvent(res, 'unread_count', { count });
    } catch (error) {
      this.logger.error(`Failed to send initial unread count to user ${userId}:`, error);
    }
  }

  broadcastToUser(userId: string, event: string, data: any): void {
    if (this.isRedisPubSubReady && this.publisher) {
      const payload: SsePayload = { userId, event, data };
      this.publisher.publish('finwise:notifications:sse', JSON.stringify(payload)).catch((err) => {
        this.logger.warn('Failed to publish SSE event to Redis, falling back to local dispatch:', err);
        this.sendToLocalClients(userId, event, data);
      });
    } else {
      this.sendToLocalClients(userId, event, data);
    }
  }

  private sendToLocalClients(userId: string, event: string, data: any): void {
    const userClients = this.clients.get(userId);
    if (!userClients || userClients.size === 0) {
      return;
    }

    for (const client of userClients) {
      try {
        if (!client.writableEnded && !client.destroyed) {
          this.writeEvent(client, event, data);
        } else {
          userClients.delete(client);
        }
      } catch (err) {
        this.logger.warn(`Error writing SSE event to client of user ${userId}:`, err);
        userClients.delete(client);
      }
    }

    if (userClients.size === 0) {
      this.clients.delete(userId);
    }
  }

  private writeEvent(res: Response, event: string, data: any): void {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    if (typeof (res as any).flush === 'function') {
      (res as any).flush();
    }
  }

  getActiveConnectionCount(userId?: string): number {
    if (userId) {
      return this.clients.get(userId)?.size || 0;
    }
    let total = 0;
    for (const set of this.clients.values()) {
      total += set.size;
    }
    return total;
  }

  shutdown(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    for (const [userId, userClients] of this.clients.entries()) {
      for (const client of userClients) {
        try {
          client.end();
        } catch {
          // ignore error on close
        }
      }
    }
    this.clients.clear();

    if (this.subscriber) {
      this.subscriber.disconnect();
      this.subscriber = null;
    }
    if (this.publisher) {
      this.publisher.disconnect();
      this.publisher = null;
    }
  }
}

export const notificationStreamService = new NotificationStreamService();
