import 'dotenv/config';
import app from './app';
import { envConfig } from './config/env.config';
import { notificationWorker } from './modules/notifications/notification.worker';

const PORT = envConfig.port;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT} in ${envConfig.nodeEnv} mode`);
  notificationWorker.start();
});
