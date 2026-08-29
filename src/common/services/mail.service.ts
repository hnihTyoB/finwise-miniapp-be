import nodemailer from 'nodemailer';
import { mailConfig } from '../../config/mail.config';

export class MailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: mailConfig.host,
      port: mailConfig.port,
      secure: mailConfig.secure,
      auth: {
        user: mailConfig.auth.user,
        pass: mailConfig.auth.pass,
      },
    });
  }

  async sendVerificationEmail(email: string, token: string, fullName?: string) {
    const verificationUrl = `${mailConfig.verificationUrl}?token=${token}`;
    const mailOptions = {
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

    if (!mailConfig.auth.user || !mailConfig.auth.pass) {
      console.warn('-------- EMAIL VERIFICATION TOKEN (DEV MODE) --------');
      console.warn(`To: ${email}`);
      console.warn(`Link: ${verificationUrl}`);
      console.warn('----------------------------------------------------');
      return;
    }

    try {
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('Failed to send verification email:', error);
      throw error;
    }
  }

  async sendPasswordResetEmail(email: string, token: string, fullName?: string) {
    const resetUrl = `${mailConfig.resetPasswordUrl}?token=${token}`;
    const mailOptions = {
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

    if (!mailConfig.auth.user || !mailConfig.auth.pass) {
      console.warn('-------- EMAIL PASSWORD RESET TOKEN (DEV MODE) --------');
      console.warn(`To: ${email}`);
      console.warn(`Link: ${resetUrl}`);
      console.warn('-------------------------------------------------------');
      return;
    }

    try {
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('Failed to send password reset email:', error);
      throw error;
    }
  }

  async sendNewDeviceAlertEmail(email: string, details: { deviceName: string; ipAddress: string; loginTime: Date }, fullName?: string) {
    const formattedDate = details.loginTime.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    const mailOptions = {
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

    if (!mailConfig.auth.user || !mailConfig.auth.pass) {
      console.warn('-------- NEW DEVICE ALERT EMAIL (DEV MODE) --------');
      console.warn(`To: ${email}`);
      console.warn(`Device: ${details.deviceName}`);
      console.warn(`IP: ${details.ipAddress}`);
      console.warn(`Time: ${formattedDate}`);
      console.warn('----------------------------------------------------');
      return;
    }

    try {
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('Failed to send new device alert email:', error);
      throw error;
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
    const escapeHtml = (value: string) => value
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

    if (!mailConfig.auth.user || !mailConfig.auth.pass) {
      console.warn('-------- NOTIFICATION EMAIL (DEV MODE) --------');
      console.warn(`To: ${email}`);
      console.warn(`Subject: ${notification.title}`);
      console.warn(`Message: ${notification.message}`);
      console.warn('----------------------------------------------');
      return;
    }

    try {
      await this.transporter.sendMail({
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
      console.error('Failed to send notification email:', error);
      throw error;
    }
  }
}
