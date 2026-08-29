export interface Hyperdrive {
  connectionString: string;
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export interface WorkerEnv {
  HYPERDRIVE?: Hyperdrive;
  NODE_ENV?: string;
  PORT?: string;
  DATABASE_URL?: string;
  JWT_ACCESS_SECRET?: string;
  JWT_REFRESH_SECRET?: string;
  [key: string]: unknown;
}
