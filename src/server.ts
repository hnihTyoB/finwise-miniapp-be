import 'dotenv/config';
import dns from 'node:dns';

// Prefer IPv4 first to prevent ENETUNREACH errors on networks/platforms without IPv6 route
dns.setDefaultResultOrder('ipv4first');

import app from './app';
import { envConfig } from './config/env.config';
import { notificationWorker } from './modules/notifications/notification.worker';
import { statementQueueService } from './modules/statements/statement-queue.service';

const PORT = envConfig.port;

const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT} in ${envConfig.nodeEnv} mode`);
  notificationWorker.start();
});

// Graceful shutdown: close BullMQ workers before process exit
const shutdown = async () => {
  notificationWorker.stop();
  await statementQueueService.close();
  server.close(() => process.exit(0));
};

process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
