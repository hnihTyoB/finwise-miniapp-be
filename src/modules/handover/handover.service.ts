import crypto from 'crypto';
import QRCode from 'qrcode';
import { AppError } from '../../common/errors/app-error';
import { ERROR_CODE } from '../../common/errors/error-code';
import { envConfig } from '../../config/env.config';
import { MailService } from '../../common/services/mail.service';
import { HandoverRepository } from './handover.repository';
import {
  ClaimHandoverDto,
  ClaimHandoverResponseDto,
  ConfirmHandoverDto,
  ConfirmHandoverResponseDto,
  HandoverResultResponseDto,
  HandoverSessionData,
  HandoverStatusResponseDto,
  InitiateHandoverResponseDto,
} from './handover.dto';

export class HandoverService {
  private readonly HANDOVER_TTL_SECONDS = 900; // 15 minutes
  private readonly MAX_FAILED_ATTEMPTS = 5;

  constructor(
    private readonly repository: HandoverRepository = new HandoverRepository(),
    private readonly mailService: MailService = new MailService(),
  ) {}

  private maskEmail(email: string): string {
    const [user, domain] = email.split('@');
    if (!domain) return email;
    const maskedUser =
      user.length <= 2
        ? user[0] + '***'
        : user.substring(0, 2) + '***' + user.substring(user.length - 1);
    return `${maskedUser}@${domain}`;
  }

  private getHandoverSecret(): string {
    return envConfig.jwt.accessSecret || 'finwise-handover-secret-salt-2026';
  }

  private generateSignature(handoverToken: string, userId: string): string {
    return crypto
      .createHmac('sha256', this.getHandoverSecret())
      .update(`${handoverToken}:${userId}`)
      .digest('hex');
  }

  /**
   * Bước 1: Máy A tạo phiên chuyển giao (Handover Token, QR Code, PIN 6 số, OTP)
   */
  async initiateHandover(
    userId: string,
    metadata?: { ipAddress?: string; userAgent?: string },
  ): Promise<InitiateHandoverResponseDto> {
    const user = await this.repository.findUserById(userId);
    if (!user || !user.isActive || user.deletedAt !== null) {
      throw new AppError('Tài khoản không hợp lệ hoặc đã bị vô hiệu hóa', 400, ERROR_CODE.USER_INACTIVE);
    }

    if (!user.email) {
      throw new AppError(
        'Tài khoản của bạn chưa có Email liên kết. Để nhận mã OTP xác thực chuyển giao quyền sở hữu, vui lòng cập nhật Email trong Cài đặt tài khoản trước.',
        400,
        ERROR_CODE.VALIDATION_ERROR,
      );
    }

    // Xóa phiên cũ nếu có
    const existingToken = await this.repository.getTokenByUserId(userId);
    if (existingToken) {
      const existingSession = await this.repository.getSessionByToken(existingToken);
      if (existingSession) {
        await this.repository.deleteSession(existingToken, existingSession.pinCode, userId);
      }
    }

    const handoverToken = crypto.randomBytes(32).toString('hex');
    const pinCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const signature = this.generateSignature(handoverToken, userId);

    const qrPayload = `finwise://handover?token=${handoverToken}&sig=${signature}`;
    const qrDataUrl = await QRCode.toDataURL(qrPayload, {
      width: 320,
      margin: 2,
      color: {
        dark: '#1e293b',
        light: '#ffffff',
      },
    });

    const session: HandoverSessionData = {
      handoverToken,
      signature,
      pinCode,
      otpCode,
      sourceUserId: userId,
      sourceUserEmail: user.email,
      sourceUserName: user.fullName || user.email || 'Tài khoản cũ',
      status: 'PENDING_CLAIM',
      targetUserId: null,
      targetUserName: null,
      failedAttempts: 0,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + this.HANDOVER_TTL_SECONDS * 1000).toISOString(),
    };

    await this.repository.saveSession(session, this.HANDOVER_TTL_SECONDS);

    console.log(
      `[Handover] Initiated session ${handoverToken} for user ${userId} (email: ${user.email}, pin: ${pinCode})`,
    );

    await this.repository.createAuditLog({
      actorId: userId,
      action: 'HANDOVER_INITIATED',
      targetType: 'HANDOVER',
      newState: {
        handoverToken,
        pinCode,
        expiresAt: session.expiresAt,
      },
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
    });

    return {
      handoverToken,
      signature,
      pinCode,
      expiresIn: this.HANDOVER_TTL_SECONDS,
      expiresAt: session.expiresAt,
      qrPayload,
      qrDataUrl,
    };
  }

  /**
   * Máy A truy vấn trạng thái phiên chuyển giao hiện tại
   */
  async getHandoverStatus(userId: string): Promise<HandoverStatusResponseDto> {
    const token = await this.repository.getTokenByUserId(userId);
    if (!token) {
      throw new AppError(
        'Không tìm thấy phiên chuyển giao đang hoạt động',
        404,
        ERROR_CODE.HANDOVER_SESSION_NOT_FOUND,
      );
    }

    const session = await this.repository.getSessionByToken(token);
    if (!session) {
      throw new AppError(
        'Phiên chuyển giao đã hết hạn hoặc không tồn tại',
        404,
        ERROR_CODE.HANDOVER_SESSION_NOT_FOUND,
      );
    }

    const expiresIn = Math.max(
      0,
      Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000),
    );

    const maskedEmail = session.sourceUserEmail ? this.maskEmail(session.sourceUserEmail) : undefined;

    return {
      handoverToken: session.handoverToken,
      status: session.status,
      pinCode: session.pinCode,
      expiresIn,
      targetUserId: session.targetUserId,
      targetUserName: session.targetUserName,
      sourceUserEmailMasked: maskedEmail,
      otpPrompt:
        session.status === 'CLAIMED'
          ? `Mã xác thực OTP gồm 6 chữ số đã được gửi đến email ${maskedEmail || 'liên kết'}. Vui lòng nhập mã để xác nhận chuyển toàn bộ dữ liệu sang tài khoản ${session.targetUserName || 'mới'}.`
          : undefined,
      otpCodeDev: process.env.NODE_ENV !== 'production' ? session.otpCode : undefined,
    };
  }

  /**
   * Bước 2: Máy B quét QR hoặc nhập mã PIN 6 số để kết nối
   */
  async claimHandover(
    targetUserId: string,
    dto: ClaimHandoverDto,
    metadata?: { ipAddress?: string; userAgent?: string },
  ): Promise<ClaimHandoverResponseDto> {
    const targetUser = await this.repository.findUserById(targetUserId);
    if (!targetUser || !targetUser.isActive || targetUser.deletedAt !== null) {
      throw new AppError('Tài khoản nhận không hợp lệ hoặc đã bị vô hiệu hóa', 400, ERROR_CODE.USER_INACTIVE);
    }

    let token = dto.handoverToken;
    if (!token && dto.pinCode) {
      const resolvedToken = await this.repository.getTokenByPin(dto.pinCode);
      if (!resolvedToken) {
        throw new AppError(
          'Mã PIN chuyển giao không hợp lệ hoặc đã hết hạn',
          404,
          ERROR_CODE.HANDOVER_SESSION_NOT_FOUND,
        );
      }
      token = resolvedToken;
    }

    if (!token) {
      throw new AppError('Mã chuyển giao không hợp lệ', 400, ERROR_CODE.VALIDATION_ERROR);
    }

    const session = await this.repository.getSessionByToken(token);
    if (!session) {
      throw new AppError(
        'Phiên chuyển giao không tồn tại hoặc đã hết hạn',
        404,
        ERROR_CODE.HANDOVER_SESSION_NOT_FOUND,
      );
    }

    const remainingTtl = Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000);
    if (remainingTtl <= 0) {
      await this.repository.deleteSession(token, session.pinCode, session.sourceUserId);
      throw new AppError('Phiên chuyển giao đã hết hạn', 400, ERROR_CODE.HANDOVER_SESSION_EXPIRED);
    }

    // Chống brute-force
    if (session.failedAttempts >= this.MAX_FAILED_ATTEMPTS) {
      await this.repository.deleteSession(token, session.pinCode, session.sourceUserId);
      throw new AppError(
        'Đã vượt quá 5 lần thử sai. Phiên chuyển giao đã bị hủy vì an toàn.',
        429,
        ERROR_CODE.HANDOVER_MAX_ATTEMPTS_EXCEEDED,
      );
    }

    // Kiểm tra chữ ký nếu gửi qua QR
    if (dto.signature) {
      const expectedSig = this.generateSignature(token, session.sourceUserId);
      if (dto.signature !== expectedSig) {
        session.failedAttempts++;
        await this.repository.saveSession(session, remainingTtl);
        throw new AppError('Chữ ký mã QR không hợp lệ', 400, ERROR_CODE.HANDOVER_SIGNATURE_INVALID);
      }
    }

    // Kiểm tra PIN
    if (dto.pinCode && dto.pinCode !== session.pinCode) {
      session.failedAttempts++;
      if (session.failedAttempts >= this.MAX_FAILED_ATTEMPTS) {
        await this.repository.deleteSession(token, session.pinCode, session.sourceUserId);
        throw new AppError(
          'Đã vượt quá 5 lần thử sai. Phiên chuyển giao đã bị hủy vì an toàn.',
          429,
          ERROR_CODE.HANDOVER_MAX_ATTEMPTS_EXCEEDED,
        );
      }
      await this.repository.saveSession(session, remainingTtl);
      throw new AppError('Mã PIN không chính xác', 400, ERROR_CODE.HANDOVER_PIN_INVALID);
    }

    // Không cho phép tự chuyển dữ liệu cho chính mình
    if (session.sourceUserId === targetUserId) {
      throw new AppError(
        'Không thể chuyển giao dữ liệu cho chính tài khoản hiện tại',
        400,
        ERROR_CODE.HANDOVER_SAME_ACCOUNT,
      );
    }

    if (session.status === 'COMPLETED') {
      throw new AppError(
        'Phiên chuyển giao này đã hoàn tất',
        400,
        ERROR_CODE.HANDOVER_ALREADY_COMPLETED,
      );
    }

    if (session.status === 'CLAIMED' && session.targetUserId && session.targetUserId !== targetUserId) {
      throw new AppError(
        'Mã chuyển giao này đã được kết nối với một tài khoản khác',
        400,
        ERROR_CODE.HANDOVER_ALREADY_CLAIMED,
      );
    }

    // Đổi trạng thái sang CLAIMED
    session.status = 'CLAIMED';
    session.targetUserId = targetUserId;
    session.targetUserName = targetUser.fullName || targetUser.email || targetUser.phoneNumber || 'Tài khoản mới';

    await this.repository.saveSession(session, remainingTtl);

    // Gửi email OTP xác nhận chuyển giao tới chủ tài khoản Máy A
    if (session.sourceUserEmail) {
      console.log(
        `[Handover] Target user "${session.targetUserName}" connected to session ${token}. Dispatching OTP to source user "${session.sourceUserEmail}"...`,
      );
      await this.mailService.sendHandoverOtpEmail(
        session.sourceUserEmail,
        session.otpCode,
        {
          targetUserName: session.targetUserName || 'Tài khoản mới',
          expiresInMinutes: Math.max(1, Math.round(remainingTtl / 60)),
        },
        session.sourceUserName,
      );
    } else {
      console.warn(
        `[Handover] Warning: Session ${token} has no sourceUserEmail (sourceUserId: ${session.sourceUserId}). Skipping email dispatch.`,
      );
    }

    await this.repository.createAuditLog({
      actorId: targetUserId,
      action: 'HANDOVER_CLAIMED',
      targetType: 'HANDOVER',
      targetId: session.sourceUserId,
      newState: {
        handoverToken: token,
        sourceUserId: session.sourceUserId,
        targetUserId,
      },
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
    });

    return {
      handoverToken: token,
      sourceUserName: session.sourceUserName || 'Tài khoản cũ',
      status: 'CLAIMED',
    };
  }

  /**
   * Bước 3: Máy A xác nhận mã OTP và thực hiện chuyển giao quyền sở hữu nguyên tử
   */
  async confirmHandover(
    sourceUserId: string,
    dto: ConfirmHandoverDto,
    metadata?: { ipAddress?: string; userAgent?: string },
  ): Promise<ConfirmHandoverResponseDto> {
    const session = await this.repository.getSessionByToken(dto.handoverToken);
    if (!session) {
      throw new AppError(
        'Phiên chuyển giao không tồn tại hoặc đã hết hạn',
        404,
        ERROR_CODE.HANDOVER_SESSION_NOT_FOUND,
      );
    }

    if (session.sourceUserId !== sourceUserId) {
      throw new AppError('Bạn không có quyền xác nhận phiên chuyển giao này', 403, ERROR_CODE.FORBIDDEN);
    }

    if (session.status !== 'CLAIMED' || !session.targetUserId) {
      throw new AppError(
        'Chưa có tài khoản mới nào kết nối tới phiên chuyển giao này',
        400,
        ERROR_CODE.HANDOVER_NOT_CLAIMED,
      );
    }

    const remainingTtl = Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000);
    if (remainingTtl <= 0) {
      await this.repository.deleteSession(session.handoverToken, session.pinCode, sourceUserId);
      throw new AppError('Phiên chuyển giao đã hết hạn', 400, ERROR_CODE.HANDOVER_SESSION_EXPIRED);
    }

    // Kiểm tra số lần thử sai
    if (session.failedAttempts >= this.MAX_FAILED_ATTEMPTS) {
      await this.repository.deleteSession(session.handoverToken, session.pinCode, sourceUserId);
      throw new AppError(
        'Đã vượt quá 5 lần thử sai. Phiên chuyển giao đã bị hủy vì an toàn.',
        429,
        ERROR_CODE.HANDOVER_MAX_ATTEMPTS_EXCEEDED,
      );
    }

    // Xác thực OTP
    if (dto.otp !== session.otpCode) {
      session.failedAttempts++;
      const attemptsLeft = this.MAX_FAILED_ATTEMPTS - session.failedAttempts;
      await this.repository.saveSession(session, remainingTtl);
      throw new AppError(
        `Mã OTP không chính xác. Bạn còn ${attemptsLeft} lần thử.`,
        400,
        ERROR_CODE.HANDOVER_OTP_INVALID,
      );
    }

    // Thực thi chuyển giao nguyên tử trong Transaction
    const recordCounts = await this.repository.executeAtomicHandover(
      sourceUserId,
      session.targetUserId,
      metadata,
    );

    // Vô hiệu hóa phiên và token của User A trên Redis
    await this.repository.decommissionUserCache(sourceUserId);
    await this.repository.invalidateUserCaches(sourceUserId, session.targetUserId);

    // Lưu trạng thái hoàn tất vào session trên Redis trong 300 giây (để máy B truy vấn kết quả)
    session.status = 'COMPLETED';
    session.completedAt = new Date().toISOString();
    session.transferredRecords = recordCounts;
    await this.repository.saveSession(session, 300);

    // Hủy mapping PIN và User mapping của A
    if (session.pinCode) {
      await this.repository.deleteSession('', session.pinCode, sourceUserId);
    }

    return {
      status: 'COMPLETED',
      targetUserId: session.targetUserId,
      targetUserName: session.targetUserName || 'Tài khoản mới',
      transferredRecords: recordCounts,
    };
  }

  /**
   * Bước 4: Máy B lấy kết quả chuyển giao
   */
  async getHandoverResult(
    targetUserId: string,
    handoverToken: string,
  ): Promise<HandoverResultResponseDto> {
    const session = await this.repository.getSessionByToken(handoverToken);
    if (!session) {
      throw new AppError(
        'Phiên chuyển giao không tồn tại hoặc đã hết hạn',
        404,
        ERROR_CODE.HANDOVER_SESSION_NOT_FOUND,
      );
    }

    if (session.targetUserId !== targetUserId) {
      throw new AppError('Bạn không có quyền xem kết quả phiên này', 403, ERROR_CODE.FORBIDDEN);
    }

    return {
      handoverToken: session.handoverToken,
      status: session.status,
      sourceUserName: session.sourceUserName,
      completedAt: session.completedAt,
      transferredRecords: session.transferredRecords,
    };
  }

  /**
   * Hủy phiên chuyển giao trước khi xác nhận
   */
  async cancelHandover(
    userId: string,
    handoverToken?: string,
    metadata?: { ipAddress?: string; userAgent?: string },
  ): Promise<void> {
    let token = handoverToken;
    if (!token) {
      const activeToken = await this.repository.getTokenByUserId(userId);
      if (activeToken) token = activeToken;
    }

    if (token) {
      const session = await this.repository.getSessionByToken(token);
      if (session && session.sourceUserId === userId) {
        await this.repository.deleteSession(token, session.pinCode, userId);
        await this.repository.createAuditLog({
          actorId: userId,
          action: 'HANDOVER_CANCELLED',
          targetType: 'HANDOVER',
          newState: { handoverToken: token },
          ipAddress: metadata?.ipAddress,
          userAgent: metadata?.userAgent,
        });
      }
    }
  }
}
