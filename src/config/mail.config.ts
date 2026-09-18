export const mailConfig = {
  get appUrl(): string {
    const custom = process.env.APP_URL;
    if (process.env.RENDER_EXTERNAL_URL && (!custom || custom.includes('localhost'))) {
      return process.env.RENDER_EXTERNAL_URL.replace(/\/+$/, '');
    }
    return (custom || 'http://localhost:7777').replace(/\/+$/, '');
  },
  host: process.env.MAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.MAIL_PORT || '587', 10),
  secure: process.env.MAIL_SECURE === 'true', // true for 465, false for 587
  auth: {
    user: process.env.MAIL_USER || '',
    pass: process.env.MAIL_PASS || '',
  },
  from: process.env.MAIL_FROM || 'FinWise <noreply@gmail.com>',
  get verificationUrl(): string {
    return `${this.appUrl}/api/v1/auth/verify-email`;
  },
  get resetPasswordUrl(): string {
    return `${this.appUrl}/api/v1/auth/reset-password`;
  },
  get resendApiKey(): string {
    return process.env.RESEND_API_KEY || '';
  },
  get isConfigured(): boolean {
    return Boolean(this.resendApiKey || (this.auth.user && this.auth.pass));
  },
};
