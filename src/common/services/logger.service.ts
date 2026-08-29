import { envConfig } from '../../config/env.config';

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'accesstoken',
  'refreshtoken',
  'apikey',
  'apikeys',
  'secret',
  'authorization',
  'cookie',
  'transport',
  'geminiapikeys',
]);

function redact(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(redact);
  }

  const redacted: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey)) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'object') {
      redacted[key] = redact(value);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

export class LoggerService {
  private readonly context: string;

  constructor(context = 'App') {
    this.context = context;
  }

  info(message: string, ...args: any[]): void {
    this.log('info', message, args);
  }

  warn(message: string, ...args: any[]): void {
    this.log('warn', message, args);
  }

  error(message: string, error?: any, ...args: any[]): void {
    const errorDetails = error instanceof Error 
      ? { ...error, message: error.message, stack: error.stack } 
      : error;
    this.log('error', message, [errorDetails, ...args]);
  }

  debug(message: string, ...args: any[]): void {
    if (envConfig.nodeEnv === 'development') {
      this.log('debug', message, args);
    }
  }

  private log(level: LogLevel, message: string, args: any[]): void {
    const timestamp = new Date().toISOString();
    const cleanArgs = args.map(redact);

    if (envConfig.nodeEnv === 'production') {
      const logPayload = {
        timestamp,
        level: level.toUpperCase(),
        context: this.context,
        message,
        ...(cleanArgs.length > 0 ? { details: cleanArgs } : {}),
      };
      console.log(JSON.stringify(logPayload));
    } else {
      const color = this.getColor(level);
      const reset = '\x1b[0m';
      const formattedDetails = cleanArgs.length > 0 
        ? '\n' + JSON.stringify(cleanArgs, null, 2) 
        : '';
      console.log(
        `[${timestamp}] ${color}${level.toUpperCase()}${reset} [${this.context}]: ${message}${formattedDetails}`
      );
    }
  }

  private getColor(level: LogLevel): string {
    switch (level) {
      case 'info':
        return '\x1b[32m'; // green
      case 'warn':
        return '\x1b[33m'; // yellow
      case 'error':
        return '\x1b[31m'; // red
      case 'debug':
        return '\x1b[36m'; // cyan
      default:
        return '';
    }
  }
}

export const logger = new LoggerService();
