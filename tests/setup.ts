// Cấu hình môi trường chạy test
process.env.NODE_ENV = 'test';
process.env.PORT = '8889';
process.env.JWT_ACCESS_SECRET = 'test_access_secret_key_123456789_xyz';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_key_123456789_xyz';
process.env.REDIS_ENABLED = 'false';
process.env.NOTIFICATION_WORKER_ENABLED = 'false';

// Limit Prisma connection pool in test runner to prevent Supabase session pool limit (15) exhaustion
if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('connection_limit')) {
  const separator = process.env.DATABASE_URL.includes('?') ? '&' : '?';
  process.env.DATABASE_URL = `${process.env.DATABASE_URL}${separator}connection_limit=5&pool_timeout=30`;
}

// Mock MailService để tránh gửi mail thật và in log cảnh báo ra console
jest.mock('../src/common/services/mail.service', () => {
  return {
    MailService: jest.fn().mockImplementation(() => {
      return {
        sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
        sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
        sendNewDeviceAlertEmail: jest.fn().mockResolvedValue(undefined),
        sendNotificationEmail: jest.fn().mockResolvedValue(undefined),
      };
    }),
  };
});
