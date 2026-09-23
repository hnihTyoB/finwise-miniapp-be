import nodemailer from 'nodemailer';
import { mailConfig } from '../../config/mail.config';

interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

export class MailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    const isGmail = mailConfig.host === 'smtp.gmail.com' || mailConfig.host.includes('gmail');
    this.transporter = nodemailer.createTransport(
      isGmail
        ? ({
            service: 'gmail',
            auth: {
              user: mailConfig.auth.user,
              pass: mailConfig.auth.pass,
            },
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 15000,
          } as any)
        : ({
            host: mailConfig.host,
            port: mailConfig.port,
            secure: mailConfig.secure,
            family: 4, // Force IPv4 to prevent ENETUNREACH on environments without IPv6 routing
            auth: {
              user: mailConfig.auth.user,
              pass: mailConfig.auth.pass,
            },
            // Explicit timeouts to prevent hanging indefinitely on cloud platforms (e.g. Render)
            connectionTimeout: 5000,
            greetingTimeout: 5000,
            socketTimeout: 8000,
          } as any),
    );
  }

  private async sendViaResend(options: SendMailOptions): Promise<void> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${mailConfig.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: options.from || mailConfig.from,
        to: [options.to],
        subject: options.subject,
        html: options.html,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Resend API HTTP ${response.status}: ${errorText}`);
    }
  }

  private async dispatchEmail(options: SendMailOptions): Promise<void> {
    // If Resend API key is configured, send via HTTPS REST API (bypasses blocked SMTP ports on cloud hosts)
    if (mailConfig.resendApiKey) {
      await this.sendViaResend(options);
      return;
    }

    // Otherwise use SMTP (nodemailer)
    if (!mailConfig.auth.user || !mailConfig.auth.pass) {
      return;
    }

    await this.transporter.sendMail({
      from: options.from || mailConfig.from,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });
  }

  async sendVerificationEmail(email: string, token: string, fullName?: string) {
    const verificationUrl = `${mailConfig.verificationUrl}?token=${token}`;
    const mailOptions: SendMailOptions = {
      from: mailConfig.from,
      to: email,
      subject: 'Xác thực tài khoản FinWise',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
          <h2 style="color: #4CAF50; text-align: center;">Chào mừng đến với FinWise!</h2>
          <p>Chào ${fullName || 'bạn'},</p>
          <p>Cảm ơn bạn đã đăng ký tài khoản tại FinWise - Sổ tay Chi tiêu & Báo cáo Tài chính.</p>
          <p>Vui lòng xác nhận địa chỉ email của bạn để kích hoạt tài khoản bằng cách click vào nút bên dưới:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" style="background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Kích hoạt tài khoản</a>
          </div>
          <p>Hoặc bạn có thể sao chép liên kết dưới đây và dán vào trình duyệt của bạn:</p>
          <p style="word-break: break-all; color: #888888;">${verificationUrl}</p>
          <p>Liên kết này sẽ có hiệu lực trong vòng 24 giờ.</p>
          <hr style="border: 0; border-top: 1px solid #e0e0e0; margin: 20px 0;" />
          <p style="font-size: 12px; color: #888888; text-align: center;">Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email này.</p>
        </div>
      `,
    };

    if (!mailConfig.isConfigured) {
      console.warn('-------- EMAIL VERIFICATION TOKEN (DEV MODE) --------');
      console.warn(`To: ${email}`);
      console.warn(`Link: ${verificationUrl}`);
      console.warn('----------------------------------------------------');
      return;
    }

    try {
      await this.dispatchEmail(mailOptions);
    } catch (error) {
      console.error('[MailService] Failed to send verification email:', error);
      console.warn('-------- VERIFICATION LINK FALLBACK (LOG) --------');
      console.warn(`To: ${email}`);
      console.warn(`Link: ${verificationUrl}`);
      console.warn('--------------------------------------------------');
      throw error;
    }
  }

  async sendPasswordResetEmail(email: string, token: string, fullName?: string) {
    const resetUrl = `${mailConfig.resetPasswordUrl}?token=${token}`;
    const mailOptions: SendMailOptions = {
      from: mailConfig.from,
      to: email,
      subject: 'Khôi phục mật khẩu tài khoản FinWise',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
          <h2 style="color: #f44336; text-align: center;">Khôi phục mật khẩu tài khoản</h2>
          <p>Chào ${fullName || 'bạn'},</p>
          <p>Chúng tôi nhận được yêu cầu khôi phục mật khẩu cho tài khoản FinWise liên kết với địa chỉ email này.</p>
          <p>Vui lòng click vào nút bên dưới để tiến hành đặt lại mật khẩu mới:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background-color: #f44336; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Đặt lại mật khẩu</a>
          </div>
          <p>Hoặc bạn có thể sao chép liên kết dưới đây và dán vào trình duyệt của bạn:</p>
          <p style="word-break: break-all; color: #888888;">${resetUrl}</p>
          <p>Liên kết này sẽ có hiệu lực trong vòng 1 giờ.</p>
          <hr style="border: 0; border-top: 1px solid #e0e0e0; margin: 20px 0;" />
          <p style="font-size: 12px; color: #888888; text-align: center;">Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email này. Mật khẩu của bạn sẽ không thay đổi.</p>
        </div>
      `,
    };

    if (!mailConfig.isConfigured) {
      console.warn('-------- EMAIL PASSWORD RESET TOKEN (DEV MODE) --------');
      console.warn(`To: ${email}`);
      console.warn(`Link: ${resetUrl}`);
      console.warn('-------------------------------------------------------');
      return;
    }

    try {
      await this.dispatchEmail(mailOptions);
    } catch (error) {
      console.error('[MailService] Failed to send password reset email:', error);
      console.warn('-------- PASSWORD RESET LINK FALLBACK (LOG) --------');
      console.warn(`To: ${email}`);
      console.warn(`Link: ${resetUrl}`);
      console.warn('----------------------------------------------------');
      throw error;
    }
  }

  async sendNewDeviceAlertEmail(
    email: string,
    details: { deviceName: string; ipAddress: string; loginTime: Date },
    fullName?: string,
  ) {
    const formattedDate = details.loginTime.toLocaleString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
    });
    const mailOptions: SendMailOptions = {
      from: mailConfig.from,
      to: email,
      subject: '[Cảnh báo bảo mật] Đăng nhập từ thiết bị mới trên FinWise',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
          <h2 style="color: #f44336; text-align: center;">Cảnh báo đăng nhập thiết bị mới</h2>
          <p>Chào ${fullName || 'bạn'},</p>
          <p>FinWise phát hiện tài khoản của bạn vừa được đăng nhập từ một thiết bị mới hoặc trình duyệt lạ.</p>
          
          <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #f44336;">
            <p style="margin: 5px 0;"><strong>Thiết bị:</strong> ${details.deviceName}</p>
            <p style="margin: 5px 0;"><strong>Địa chỉ IP:</strong> ${details.ipAddress}</p>
            <p style="margin: 5px 0;"><strong>Thời gian:</strong> ${formattedDate} (Giờ Việt Nam)</p>
          </div>

          <p>Nếu <strong>đây là bạn</strong>, bạn không cần làm gì cả. Thiết bị này sẽ tự động được thêm vào danh sách tin cậy.</p>
          <p style="color: #f44336; font-weight: bold;">Nếu KHÔNG phải bạn, vui lòng thực hiện các bước sau ngay lập tức để bảo vệ tài khoản:</p>
          <ol>
            <li>Đăng nhập vào tài khoản trên thiết bị chính chủ của bạn.</li>
            <li>Vào mục <strong>Cài đặt bảo mật > Quản lý thiết bị</strong> để đăng xuất từ xa phiên đăng nhập lạ này.</li>
            <li>Tiến hành <strong>Đổi mật khẩu</strong> tài khoản ngay lập tức.</li>
          </ol>
          <hr style="border: 0; border-top: 1px solid #e0e0e0; margin: 20px 0;" />
          <p style="font-size: 12px; color: #888888; text-align: center;">Đây là email tự động từ hệ thống bảo mật FinWise. Vui lòng không trả lời email này.</p>
        </div>
      `,
    };

    if (!mailConfig.isConfigured) {
      console.warn('-------- NEW DEVICE ALERT EMAIL (DEV MODE) --------');
      console.warn(`To: ${email}`);
      console.warn(`Device: ${details.deviceName}`);
      console.warn(`IP: ${details.ipAddress}`);
      console.warn(`Time: ${formattedDate}`);
      console.warn('----------------------------------------------------');
      return;
    }

    try {
      await this.dispatchEmail(mailOptions);
    } catch (error) {
      console.error('[MailService] Failed to send new device alert email:', error);
      // Non-critical alert, don't re-throw to avoid blocking login flow
    }
  }

  async sendNotificationEmail(
    email: string,
    notification: {
      title: string;
      message: string;
      actionUrl: string | null;
    },
    fullName?: string | null,
  ) {
    const escapeHtml = (value: string) =>
      value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    const actionUrl = notification.actionUrl
      ? notification.actionUrl.startsWith('/')
        ? `${mailConfig.appUrl}${notification.actionUrl}`
        : notification.actionUrl
      : null;
    const actionHtml = actionUrl
      ? `<p style="text-align: center; margin-top: 24px;"><a href="${escapeHtml(actionUrl)}" style="background-color: #2563eb; color: white; padding: 10px 18px; text-decoration: none; border-radius: 5px;">Open FinWise</a></p>`
      : '';

    if (!mailConfig.isConfigured) {
      console.warn('-------- NOTIFICATION EMAIL (DEV MODE) --------');
      console.warn(`To: ${email}`);
      console.warn(`Subject: ${notification.title}`);
      console.warn(`Message: ${notification.message}`);
      console.warn('----------------------------------------------');
      return;
    }

    try {
      await this.dispatchEmail({
        from: mailConfig.from,
        to: email,
        subject: `[FinWise] ${notification.title.replace(/[\r\n]+/g, ' ')}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <p>Hello ${escapeHtml(fullName || 'there')},</p>
            <h2>${escapeHtml(notification.title)}</h2>
            <p>${escapeHtml(notification.message)}</p>
            ${actionHtml}
          </div>
        `,
      });
    } catch (error) {
      console.error('[MailService] Failed to send notification email:', error);
      throw error;
    }
  }

  async sendHandoverOtpEmail(
    email: string,
    otp: string,
    details: {
      targetUserName: string;
      expiresInMinutes: number;
    },
    fullName?: string | null,
  ): Promise<void> {
    const formattedMinutes = details.expiresInMinutes > 0 ? details.expiresInMinutes : 15;
    const mailOptions: SendMailOptions = {
      from: mailConfig.from,
      to: email,
      subject: '[FinWise] Mã OTP xác nhận chuyển giao quyền sở hữu tài khoản',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h2 style="color: #0f172a; margin: 0; font-size: 22px;">Xác Nhận Chuyển Giao Quyền Sở Hữu</h2>
            <p style="color: #64748b; font-size: 14px; margin-top: 6px;">FinWise - Sổ tay Tài chính & Báo cáo Thông minh</p>
          </div>

          <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 14px 16px; border-radius: 4px; margin-bottom: 20px;">
            <p style="color: #991b1b; font-weight: bold; margin: 0 0 4px 0; font-size: 14px;">Cảnh Báo Bảo Mật Quan Trọng</p>
            <p style="color: #7f1d1d; margin: 0; font-size: 13px; line-height: 1.5;">
              Tài khoản <strong>${details.targetUserName}</strong> vừa yêu cầu nhận chuyển giao toàn bộ dữ liệu tài chính (ví tiền, lịch sử giao dịch, ngân sách, mục tiêu) từ tài khoản của bạn.
            </p>
          </div>

          <p style="color: #334155; font-size: 14px; line-height: 1.6;">
            Chào <strong>${fullName || 'bạn'}</strong>,<br/>
            Nếu bạn đang thực hiện chuyển giao sang tài khoản Zalo mới, vui lòng nhập mã OTP dưới đây vào ứng dụng để ký duyệt lệnh chuyển giao:
          </p>

          <div style="text-align: center; margin: 28px 0; padding: 18px; background-color: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 8px;">
            <span style="font-size: 13px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; display: block; margin-bottom: 8px;">Mã Xác Thực OTP Của Bạn</span>
            <span style="font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: bold; letter-spacing: 10px; color: #0284c7; display: inline-block;">${otp}</span>
            <span style="font-size: 12px; color: #dc2626; display: block; margin-top: 10px; font-weight: 500;">
              Mã có hiệu lực trong vòng ${formattedMinutes} phút
            </span>
          </div>

          <div style="background-color: #f1f5f9; padding: 14px; border-radius: 6px; font-size: 12px; color: #475569; line-height: 1.5; margin-bottom: 24px;">
            <p style="margin: 0 0 6px 0;"><strong>Lưu ý an toàn:</strong></p>
            <ul style="margin: 0; padding-left: 18px;">
              <li>Sau khi xác nhận, toàn bộ dữ liệu sẽ được chuyển giao vĩnh viễn và tài khoản hiện tại sẽ tự động đăng xuất.</li>
              <li>Tuyệt đối <strong>KHÔNG</strong> chia sẻ mã OTP này cho bất kỳ ai khác.</li>
              <li>Nếu bạn <strong>KHÔNG</strong> thực hiện yêu cầu này, vui lòng mở ứng dụng và nhấn <strong>"Từ chối & Hủy bỏ"</strong> ngay lập tức.</li>
            </ul>
          </div>

          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          <p style="font-size: 11px; color: #94a3b8; text-align: center; margin: 0;">
            Đây là email tự động từ hệ thống bảo mật FinWise. Vui lòng không trả lời thư này.
          </p>
        </div>
      `,
    };

    if (!mailConfig.isConfigured) {
      console.warn('-------- HANDOVER OTP EMAIL (DEV MODE) --------');
      console.warn(`To: ${email}`);
      console.warn(`Target User: ${details.targetUserName}`);
      console.warn(`OTP Code: ${otp}`);
      console.warn(`Expires In: ${formattedMinutes} minutes`);
      console.warn('-----------------------------------------------');
      return;
    }

    console.log(`[MailService] Preparing to dispatch handover OTP email to: ${email}...`);
    try {
      await this.dispatchEmail(mailOptions);
      console.log(`[MailService] Handover OTP email successfully dispatched to: ${email}`);
    } catch (error) {
      console.error('[MailService] Failed to send handover OTP email:', error);
      console.warn('-------- HANDOVER OTP FALLBACK LOG --------');
      console.warn(`To: ${email} | OTP: ${otp}`);
      console.warn('-------------------------------------------');
    }
  }
}
