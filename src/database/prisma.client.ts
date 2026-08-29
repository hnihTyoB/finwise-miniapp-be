import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { Hyperdrive, WorkerEnv } from '../types/worker-env';

const isDev = process.env.NODE_ENV === 'development';
const logOptions: ('query' | 'error' | 'warn')[] = isDev
  ? ['query', 'error', 'warn']
  : ['error', 'warn'];

/**
 * Tạo PrismaClient từ Hyperdrive hoặc PostgreSQL connection string qua Driver Adapter
 */
export function createHyperdrivePrismaClient(
  hyperdriveOrConnectionString: Hyperdrive | string,
): PrismaClient {
  const connectionString =
    typeof hyperdriveOrConnectionString === 'string'
      ? hyperdriveOrConnectionString
      : hyperdriveOrConnectionString.connectionString;

  const pool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
  });

  const adapter = new PrismaPg(pool);
  return new PrismaClient({
    adapter,
    log: logOptions,
  });
}

// Connection-keyed cached client instances
const clientPool = new Map<string, PrismaClient>();
let defaultNodePrisma: PrismaClient | null = null;

export function setWorkerEnv(_env: WorkerEnv) {
  // Retained for backward-compatibility without global state mutation
}

function isEdgeRuntime(): boolean {
  return (
    typeof (globalThis as any).WebSocketPair !== 'undefined' ||
    typeof (globalThis as any).EdgeRuntime !== 'undefined' ||
    Boolean((globalThis as any).navigator?.userAgent?.includes('Cloudflare-Workers'))
  );
}

/**
 * Lấy PrismaClient tương thích với Cloudflare Worker Environment hoặc Node.js process
 */
export function getPrismaClient(env?: WorkerEnv): PrismaClient {
  if (env?.HYPERDRIVE?.connectionString) {
    const key = env.HYPERDRIVE.connectionString;
    let client = clientPool.get(key);
    if (!client) {
      client = createHyperdrivePrismaClient(env.HYPERDRIVE);
      clientPool.set(key, client);
    }
    return client;
  }

  if (isEdgeRuntime()) {
    const connStr =
      process.env.DATABASE_URL ||
      process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE ||
      '';
    let client = clientPool.get(connStr);
    if (!client) {
      client = createHyperdrivePrismaClient(connStr);
      clientPool.set(connStr, client);
    }
    return client;
  }

  if (!defaultNodePrisma) {
    const connStr = process.env.DATABASE_URL || '';
    if (connStr) {
      defaultNodePrisma = createHyperdrivePrismaClient(connStr);
    } else {
      defaultNodePrisma = new PrismaClient({
        log: logOptions,
      });
    }
  }
  return defaultNodePrisma;
}

/**
 * Lazy proxy Prisma instance cho Node.js server hoặc standard imports
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrismaClient();
    const value = (client as any)[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

export default prisma;
