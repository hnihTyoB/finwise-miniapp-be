const isProduction = (process.env.NODE_ENV || 'development') === 'production';

if (isProduction) {
  const accessSecret = process.env.JWT_ACCESS_SECRET;
  const refreshSecret = process.env.JWT_REFRESH_SECRET;
  if (!accessSecret || accessSecret.includes('default') || accessSecret.length < 32) {
    throw new Error(
      'FATAL: JWT_ACCESS_SECRET must be configured with at least 32 characters and cannot use default values in production.',
    );
  }
  if (!refreshSecret || refreshSecret.includes('default') || refreshSecret.length < 32) {
    throw new Error(
      'FATAL: JWT_REFRESH_SECRET must be configured with at least 32 characters and cannot use default values in production.',
    );
  }
}

export const envConfig = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '8888', 10),
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    name: process.env.DB_NAME || 'datacrawler',
  },
  get databaseUrl() {
    return `postgresql://${this.database.user}:${encodeURIComponent(this.database.password)}@${this.database.host}:${this.database.port}/${this.database.name}?schema=public`;
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'default_access_secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'default_refresh_secret',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '30m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  trustProxy: (() => {
    const val = process.env.TRUST_PROXY;
    if (!val) return false;
    if (val === 'true') return true;
    if (val === 'false') return false;
    if (/^\d+$/.test(val)) return parseInt(val, 10);
    if (val.includes(',')) return val.split(',').map(s => s.trim());
    return val;
  })(),
  cors: {
    allowedOrigins: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
      : ['*'],
  },
  receipts: {
    uploadDir: process.env.RECEIPT_UPLOAD_DIR || 'storage/receipts',
    maxFileSizeMb: (() => {
      const value = parseInt(process.env.RECEIPT_MAX_FILE_SIZE_MB || '5', 10);
      return Number.isFinite(value) && value > 0 && value <= 25 ? value : 5;
    })(),
    get maxFileSizeBytes() {
      return this.maxFileSizeMb * 1024 * 1024;
    },
  },
  r2: {
    accountId: process.env.R2_ACCOUNT_ID || '',
    bucketName: process.env.R2_BUCKET_NAME || '',
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    publicBaseUrl: (process.env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, ''),
    presignedUrlExpiresInSeconds: (() => {
      const value = parseInt(process.env.R2_PRESIGNED_URL_EXPIRES_IN_SECONDS || '300', 10);
      return Number.isFinite(value) && value >= 60 && value <= 3600 ? value : 300;
    })(),
    avatarMaxFileSizeMb: (() => {
      const value = parseInt(process.env.R2_AVATAR_MAX_FILE_SIZE_MB || '5', 10);
      return Number.isFinite(value) && value > 0 && value <= 10 ? value : 5;
    })(),
    get avatarMaxFileSizeBytes() {
      return this.avatarMaxFileSizeMb * 1024 * 1024;
    },
  },
  notifications: {
    workerEnabled: process.env.NOTIFICATION_WORKER_ENABLED !== 'false',
    workerIntervalMs: (() => {
      const value = parseInt(process.env.NOTIFICATION_WORKER_INTERVAL_MS || '60000', 10);
      return Number.isFinite(value) && value >= 5000 && value <= 3600000
        ? value
        : 60000;
    })(),
    financialScanIntervalMs: (() => {
      const value = parseInt(
        process.env.NOTIFICATION_FINANCIAL_SCAN_INTERVAL_MS || '300000',
        10,
      );
      return Number.isFinite(value) && value >= 60000 && value <= 86400000
        ? value
        : 300000;
    })(),
    concurrency: (() => {
      const value = parseInt(process.env.NOTIFICATION_WORKER_CONCURRENCY || '5', 10);
      return Number.isFinite(value) && value >= 1 && value <= 50 ? value : 5;
    })(),
    deliveryTimeoutMs: (() => {
      const value = parseInt(process.env.NOTIFICATION_DELIVERY_TIMEOUT_MS || '10000', 10);
      return Number.isFinite(value) && value >= 1000 && value <= 60000 ? value : 10000;
    })(),
    maxDeliveryAttempts: (() => {
      const value = parseInt(process.env.NOTIFICATION_MAX_DELIVERY_ATTEMPTS || '5', 10);
      return Number.isFinite(value) && value >= 1 && value <= 20 ? value : 5;
    })(),
    backoffBaseDelayMs: (() => {
      const value = parseInt(process.env.NOTIFICATION_BACKOFF_BASE_DELAY_MS || '60000', 10);
      return Number.isFinite(value) && value >= 1000 && value <= 600000 ? value : 60000;
    })(),
    // How often (ms) the worker scans all active users for newly discovered subscriptions.
    // Defaults to once every 24 hours. Set to 0 to disable subscription scanning.
    subscriptionScanIntervalMs: (() => {
      const value = parseInt(
        process.env.NOTIFICATION_SUBSCRIPTION_SCAN_INTERVAL_MS || '86400000',
        10,
      );
      return Number.isFinite(value) && value >= 3_600_000 && value <= 86_400_000
        ? value
        : 86_400_000;
    })(),
  },
  webhooks: {
    concurrency: (() => {
      const value = parseInt(process.env.WEBHOOK_WORKER_CONCURRENCY || '5', 10);
      return Number.isFinite(value) && value >= 1 && value <= 50 ? value : 5;
    })(),
    timeoutMs: (() => {
      const value = parseInt(process.env.WEBHOOK_TIMEOUT_MS || '10000', 10);
      return Number.isFinite(value) && value >= 1000 && value <= 60000 ? value : 10000;
    })(),
    maxAttempts: (() => {
      const value = parseInt(process.env.WEBHOOK_MAX_ATTEMPTS || '5', 10);
      return Number.isFinite(value) && value >= 1 && value <= 20 ? value : 5;
    })(),
  },
  recurringTransactions: {
    batchLimit: (() => {
      const value = parseInt(process.env.RECURRING_TRANSACTION_BATCH_LIMIT || '100', 10);
      return Number.isFinite(value) && value >= 1 && value <= 500 ? value : 100;
    })(),
  },
  ai: {
    provider: process.env.AI_PROVIDER || 'gemini',
    geminiApiKeys: Array.from(new Set(
      (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    )),
    geminiModel: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
    geminiBaseUrl:
      process.env.GEMINI_API_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta',
    requestTimeoutMs: (() => {
      const value = parseInt(process.env.AI_REQUEST_TIMEOUT_MS || '30000', 10);
      return Number.isFinite(value) && value >= 1000 && value <= 120000 ? value : 30000;
    })(),
    maxOutputTokens: (() => {
      const value = parseInt(process.env.AI_MAX_OUTPUT_TOKENS || '2048', 10);
      return Number.isFinite(value) && value >= 256 && value <= 8192 ? value : 2048;
    })(),
    maxContextTransactions: (() => {
      const value = parseInt(process.env.AI_MAX_CONTEXT_TRANSACTIONS || '200', 10);
      return Number.isFinite(value) && value >= 20 && value <= 500 ? value : 200;
    })(),
    rateLimit: {
      maxRequests: (() => {
        const value = parseInt(process.env.AI_RATE_LIMIT_MAX_REQUESTS || '20', 10);
        return Number.isFinite(value) && value >= 1 && value <= 500 ? value : 20;
      })(),
      windowMs: (() => {
        const value = parseInt(process.env.AI_RATE_LIMIT_WINDOW_MS || '900000', 10);
        return Number.isFinite(value) && value >= 1000 && value <= 86400000
          ? value
          : 900000;
      })(),
    },
  },
  redis: {
    url: process.env.REDIS_URL || '',
    host: (() => {
      if (process.env.REDIS_HOST) return process.env.REDIS_HOST;
      if (process.env.REDIS_URL) {
        try {
          return new URL(process.env.REDIS_URL).hostname || 'localhost';
        } catch {
          return 'localhost';
        }
      }
      return 'localhost';
    })(),
    port: (() => {
      if (process.env.REDIS_PORT) return parseInt(process.env.REDIS_PORT, 10);
      if (process.env.REDIS_URL) {
        try {
          const p = new URL(process.env.REDIS_URL).port;
          return p ? parseInt(p, 10) : 6379;
        } catch {
          return 6379;
        }
      }
      return 6379;
    })(),
    password: (() => {
      if (process.env.REDIS_PASSWORD) return process.env.REDIS_PASSWORD;
      if (process.env.REDIS_URL) {
        try {
          return new URL(process.env.REDIS_URL).password || undefined;
        } catch {
          return undefined;
        }
      }
      return undefined;
    })(),
    enabled: process.env.REDIS_ENABLED !== 'false',
  },
  rateLimit: {
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '1000', 10),
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes default
  },
  apiKeyRateLimit: {
    maxRequests: (() => {
      const val = parseInt(process.env.API_KEY_RATE_LIMIT_MAX_REQUESTS || '120', 10);
      return Number.isFinite(val) && val >= 1 && val <= 10000 ? val : 120;
    })(),
    windowMs: (() => {
      const val = parseInt(process.env.API_KEY_RATE_LIMIT_WINDOW_MS || '60000', 10);
      return Number.isFinite(val) && val >= 1000 && val <= 3600000 ? val : 60000;
    })(),
  },
  zaloBot: {
    token: process.env.ZALO_BOT_TOKEN || '',
    apiBaseUrl: 'https://bot-api.zaloplatforms.com',
    secretToken: process.env.ZALO_BOT_SECRET_TOKEN || '',
    webhookUrl: process.env.ZALO_BOT_WEBHOOK_URL || '',
    botId: process.env.ZALO_BOT_ID || '3517263789471244097',
    botUsername: process.env.ZALO_BOT_USERNAME || 'bot.uGsxQaGt',
    botDisplayName: process.env.ZALO_BOT_DISPLAY_NAME || 'Bot Finwise',
    botDeepLinkUrl: process.env.ZALO_BOT_DEEP_LINK_URL || 'https://bot.zaloplatforms.com/bots/3517263789471244097',
    linkCodeTtlSeconds: (() => {
      const val = parseInt(process.env.ZALO_BOT_LINK_CODE_TTL_SECONDS || '600', 10);
      return Number.isFinite(val) && val >= 60 && val <= 3600 ? val : 600;
    })(),
    requestTimeoutMs: (() => {
      const val = parseInt(process.env.ZALO_BOT_REQUEST_TIMEOUT_MS || '8000', 10);
      return Number.isFinite(val) && val >= 1000 && val <= 30000 ? val : 8000;
    })(),
  },
  auditLogs: {
    retentionDays: (() => {
      const val = parseInt(process.env.AUDIT_LOG_RETENTION_DAYS || '30', 10);
      return Number.isFinite(val) && val >= 1 ? val : 30;
    })(),
    archiveDir: process.env.AUDIT_LOG_ARCHIVE_DIR || 'storage/archives/audit-logs',
    cleanupIntervalMs: (() => {
      const val = parseInt(process.env.AUDIT_LOG_CLEANUP_INTERVAL_MS || '86400000', 10);
      return Number.isFinite(val) && val >= 60000 ? val : 86400000;
    })(),
  },
};
