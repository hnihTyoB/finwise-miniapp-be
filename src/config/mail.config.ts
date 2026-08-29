const appUrl = process.env.APP_URL || 'http://localhost:7777';

export const mailConfig = {
  appUrl,
  host: process.env.MAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.MAIL_PORT || '587', 10),
  secure: process.env.MAIL_SECURE === 'true', // true for 465, false for 587
  auth: {
    user: process.env.MAIL_USER || '',
    pass: process.env.MAIL_PASS || '',
  },
  from: process.env.MAIL_FROM || 'FinWise <noreply@gmail.com>',
  verificationUrl: `${appUrl}/api/v1/auth/verify-email`,
  resetPasswordUrl: `${appUrl}/api/v1/auth/reset-password`,
};
