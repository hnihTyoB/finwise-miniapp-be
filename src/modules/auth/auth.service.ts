import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AuthRepository } from './auth.repository';
import { AppError } from '../../common/errors/app-error';
import { ERROR_CODE } from '../../common/errors/error-code';
import { jwtConfig } from '../../config/jwt.config';
import { LoginDto, ZaloLoginDto, ZaloProfileResponse, ZaloPhoneResponse, LoginResponseDto, AuthTokensDto, MeDto, RegisterDto, UpdateProfileDto, UpdateAvatarDto, UpdatePasswordDto, ForgotPasswordDto, ResetPasswordDto, ResendVerificationDto, SessionQueryDto, SessionsResponseDto } from './auth.dto';
import https from 'https';
import { MailService } from '../../common/services/mail.service';
import { generateDeviceHash, parseUserAgent } from '../../common/helpers/user-agent.helper';
import { rbacService } from '../rbac/rbac.service';
import { SYSTEM_ROLES } from '../../common/constants';

import { UploadService } from '../uploads/upload.service';

function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export class AuthService {
  private readonly repository = new AuthRepository();
  private readonly mailService = new MailService();
  private readonly uploadService = new UploadService();

  async login(data: LoginDto, metadata?: { userAgent?: string; ipAddress?: string }): Promise<LoginResponseDto> {
    const rawIdentifier = (data.account || data.email || '').trim();
    const { password } = data;

    let user;
    if (rawIdentifier.includes('@')) {
      user = await this.repository.findByEmail(rawIdentifier.toLowerCase());
    } else {
      const normalizedPhone = rawIdentifier.replace(/^\+84/, '0').replace(/^84/, '0');
      user = await this.repository.findByPhone(normalizedPhone);
      if (!user) {
        user = await this.repository.findByEmail(rawIdentifier.toLowerCase());
      }
    }

    if (!user) {
      throw new AppError('Invalid credentials', 401, ERROR_CODE.INVALID_CREDENTIALS);
    }

    if (!user.isActive) {
      throw new AppError('Account is inactive', 403, ERROR_CODE.USER_INACTIVE);
    }

    const isPasswordValid = await bcrypt.compare(password, user.password || '');
    if (!isPasswordValid) {
      throw new AppError('Invalid credentials', 401, ERROR_CODE.INVALID_CREDENTIALS);
    }

    const payload = { id: user.id, email: user.email, role: user.role.name };

    const accessToken = jwt.sign(payload, jwtConfig.accessSecret, {
      expiresIn: jwtConfig.accessExpiresIn as any,
    });

    const refreshToken = jwt.sign(
      { ...payload, jti: crypto.randomUUID() },
      jwtConfig.refreshSecret,
      { expiresIn: jwtConfig.refreshExpiresIn as any }
    );

    const decoded = jwt.decode(refreshToken) as { exp: number };
    const expiresAt = new Date(decoded.exp * 1000);

    // Save refresh token to database
    await this.repository.saveRefreshToken(user.id, refreshToken, expiresAt, metadata?.userAgent, metadata?.ipAddress);

    // Track user devices and trigger new device login alert
    if (metadata?.userAgent) {
      const deviceHash = generateDeviceHash(metadata.userAgent);
      const parsedDevice = parseUserAgent(metadata.userAgent);

      const existingDevice = await this.repository.findUserDevice(user.id, deviceHash);
      if (!existingDevice) {
        await this.repository.createUserDevice({
          userId: user.id,
          deviceHash,
          deviceName: parsedDevice,
          ipAddress: metadata.ipAddress,
        });

        if (user.email) {
          this.mailService.sendNewDeviceAlertEmail(
            user.email,
            {
              deviceName: parsedDevice,
              ipAddress: metadata.ipAddress || 'Không rõ',
              loginTime: new Date(),
            },
            user.fullName || undefined
          ).catch(err => {
            console.error('Failed to send unrecognized device email:', err);
          });
        }
      } else {
        await this.repository.updateUserDeviceLastLogin(user.id, deviceHash, metadata.ipAddress);
      }
    }

    const permissions = await rbacService.getUserPermissions(user.id);

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        avatarUrl: user.avatarUrl,
        avatarPositionX: user.avatarPositionX,
        avatarPositionY: user.avatarPositionY,
        phoneNumber: user.phoneNumber,
        roleId: user.roleId,
        role: {
          id: user.role.id,
          name: user.role.name,
          description: user.role.description,
          isSystem: user.role.isSystem,
        },
        permissions,
        isActive: user.isActive,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      accessToken,
      refreshToken,
    };
  }

  async refresh(token: string, metadata?: { userAgent?: string; ipAddress?: string }): Promise<AuthTokensDto> {
    let payload: any;
    try {
      payload = jwt.verify(token, jwtConfig.refreshSecret);
    } catch (_error) {
      throw new AppError('Invalid refresh token', 401, ERROR_CODE.TOKEN_INVALID);
    }

    const savedToken = await this.repository.findRefreshToken(token);
    if (!savedToken) {
      throw new AppError('Invalid or expired refresh token', 401, ERROR_CODE.TOKEN_INVALID);
    }

    if (savedToken.expiresAt < new Date()) {
      await this.repository.deleteRefreshToken(token);
      throw new AppError('Refresh token expired', 401, ERROR_CODE.TOKEN_EXPIRED);
    }

    const user = await this.repository.findById(payload.id);
    if (!user || !user.isActive) {
      throw new AppError('User not found or inactive', 401, ERROR_CODE.USER_INACTIVE);
    }

    const newPayload = { id: user.id, email: user.email, role: user.role.name };

    const newAccessToken = jwt.sign(newPayload, jwtConfig.accessSecret, {
      expiresIn: jwtConfig.accessExpiresIn as any,
    });

    const newRefreshToken = jwt.sign(
      { ...newPayload, jti: crypto.randomUUID() },
      jwtConfig.refreshSecret,
      { expiresIn: jwtConfig.refreshExpiresIn as any }
    );

    const decoded = jwt.decode(newRefreshToken) as { exp: number };
    const expiresAt = new Date(decoded.exp * 1000);

    // Atomic token rotation
    await this.repository.rotateRefreshToken(token, {
      userId: user.id,
      token: newRefreshToken,
      expiresAt,
      userAgent: metadata?.userAgent,
      ipAddress: metadata?.ipAddress,
    });

    await this.repository.cleanupExpiredSessions(user.id);
    await this.repository.enforceSessionLimit(user.id, 10);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  async logout(token: string) {
    const result = await this.repository.deleteRefreshToken(token);

    if (result.count === 0) {
      throw new AppError('Token not found or already invalidated', 400, ERROR_CODE.TOKEN_INVALID);
    }
  }

  async getMe(userId: string): Promise<MeDto> {
    const user = await this.repository.findById(userId);

    if (!user) {
      throw new AppError('User not found', 404, ERROR_CODE.NOT_FOUND);
    }

    const permissions = await rbacService.getUserPermissions(user.id);

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      avatarPositionX: user.avatarPositionX,
      avatarPositionY: user.avatarPositionY,
      phoneNumber: user.phoneNumber,
      roleId: user.roleId,
      role: {
        id: user.role.id,
        name: user.role.name,
        description: user.role.description,
        isSystem: user.role.isSystem,
      },
      permissions,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async register(data: RegisterDto): Promise<void> {
    const { email, password, fullName } = data;

    const existing = await this.repository.findByEmail(email);
    if (existing) {
      throw new AppError('Email already exists', 400, ERROR_CODE.DUPLICATE_ENTRY);
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const defaultRole = await this.repository.findRoleByName(SYSTEM_ROLES.USER);
    if (!defaultRole) {
      throw new AppError('Default role not found', 500, ERROR_CODE.NOT_FOUND);
    }

    const user = await this.repository.createUser({
      email,
      passwordHash,
      fullName,
      roleId: defaultRole.id,
      isActive: false,
    });

    const rawToken = crypto.randomUUID();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.repository.createVerificationToken(user.id, tokenHash, expiresAt);

    await this.mailService.sendVerificationEmail(email, rawToken, fullName || undefined);
  }

  async verifyEmail(token: string): Promise<void> {
    const tokenHash = hashToken(token);
    let verificationToken = await this.repository.findVerificationToken(tokenHash);
    if (!verificationToken) {
      verificationToken = await this.repository.findVerificationToken(token);
    }

    if (!verificationToken) {
      throw new AppError('Invalid verification token', 400, ERROR_CODE.TOKEN_INVALID);
    }

    if (verificationToken.expiresAt < new Date()) {
      await this.repository.deleteVerificationToken(verificationToken.id);
      throw new AppError('Verification token has expired', 400, ERROR_CODE.TOKEN_EXPIRED);
    }

    await this.repository.activateUser(verificationToken.userId);
    await this.repository.deleteVerificationToken(verificationToken.id);
  }

  async updateProfile(userId: string, data: UpdateProfileDto): Promise<MeDto> {
    const user = await this.repository.findById(userId);
    if (!user) {
      throw new AppError('User not found', 404, ERROR_CODE.NOT_FOUND);
    }

    // Check if profile fields are unchanged
    const isFullNameSame = data.fullName === undefined || data.fullName === user.fullName || (!data.fullName && !user.fullName);
    const isPhoneSame = data.phoneNumber === undefined || data.phoneNumber === user.phoneNumber || (!data.phoneNumber && !user.phoneNumber);

    if (isFullNameSame && isPhoneSame) {
      return this.getMe(userId);
    }

    if (data.phoneNumber && data.phoneNumber !== user.phoneNumber) {
      const existingPhone = await this.repository.findByPhone(data.phoneNumber);
      if (existingPhone && existingPhone.id !== userId) {
        throw new AppError('Phone number already exists', 400, ERROR_CODE.DUPLICATE_ENTRY);
      }
    }

    await this.repository.updateProfile(userId, {
      fullName: data.fullName,
      phoneNumber: data.phoneNumber,
    });
    return this.getMe(userId);
  }

  async updateAvatar(userId: string, data: UpdateAvatarDto): Promise<MeDto> {
    const user = await this.repository.findById(userId);
    if (!user) {
      throw new AppError('User not found', 404, ERROR_CODE.NOT_FOUND);
    }

    const isAvatarSame = data.avatarUrl === user.avatarUrl || (!data.avatarUrl && !user.avatarUrl);
    const isAvatarXSame = data.avatarPositionX === undefined || data.avatarPositionX === user.avatarPositionX;
    const isAvatarYSame = data.avatarPositionY === undefined || data.avatarPositionY === user.avatarPositionY;

    if (isAvatarSame && isAvatarXSame && isAvatarYSame) {
      return this.getMe(userId);
    }

    if (user.avatarUrl && user.avatarUrl !== data.avatarUrl) {
      await this.uploadService.deleteFileByUrl(user.avatarUrl);
    }

    const avatarData = data.avatarUrl === null
      ? {
        avatarUrl: null,
        avatarPositionX: 50,
        avatarPositionY: 50,
      }
      : {
        avatarUrl: data.avatarUrl,
        avatarPositionX: data.avatarPositionX ?? user.avatarPositionX,
        avatarPositionY: data.avatarPositionY ?? user.avatarPositionY,
      };

    await this.repository.updateAvatar(userId, avatarData);
    return this.getMe(userId);
  }

  async updatePassword(userId: string, data: UpdatePasswordDto): Promise<void> {
    const user = await this.repository.findById(userId);
    if (!user) {
      throw new AppError('User not found', 404, ERROR_CODE.NOT_FOUND);
    }

    if (user.password) {
      if (!data.oldPassword) {
        throw new AppError('Old password is required', 400, ERROR_CODE.INVALID_CREDENTIALS);
      }
      const isPasswordValid = await bcrypt.compare(data.oldPassword, user.password);
      if (!isPasswordValid) {
        throw new AppError('Invalid old password', 401, ERROR_CODE.INVALID_CREDENTIALS);
      }
    }

    const passwordHash = await bcrypt.hash(data.newPassword, 10);
    await this.repository.updatePassword(userId, passwordHash);
  }

  async softDeleteUser(userId: string, adminId: string): Promise<void> {
    const user = await this.repository.findById(userId);
    if (!user) {
      throw new AppError('User not found', 404, ERROR_CODE.NOT_FOUND);
    }

    await this.repository.softDelete(userId, adminId);
    await rbacService.invalidateUserCache(userId);
  }

  async forgotPassword(data: ForgotPasswordDto): Promise<void> {
    const user = await this.repository.findByEmail(data.email);
    // Silent no-op: do not reveal whether the email exists (prevents user enumeration)
    if (!user) return;

    const rawToken = crypto.randomUUID();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await this.repository.createPasswordResetToken(user.id, tokenHash, expiresAt);

    await this.mailService.sendPasswordResetEmail(user.email!, rawToken, user.fullName || undefined);
  }

  async resetPassword(data: ResetPasswordDto): Promise<void> {
    const tokenHash = hashToken(data.token);
    let resetToken = await this.repository.findPasswordResetToken(tokenHash);
    if (!resetToken) {
      resetToken = await this.repository.findPasswordResetToken(data.token);
    }
    if (!resetToken) {
      throw new AppError('Invalid or expired reset token', 400, ERROR_CODE.TOKEN_INVALID);
    }

    if (resetToken.expiresAt < new Date()) {
      await this.repository.deletePasswordResetToken(resetToken.id);
      throw new AppError('Reset token has expired', 400, ERROR_CODE.TOKEN_EXPIRED);
    }

    const passwordHash = await bcrypt.hash(data.newPassword, 10);
    await this.repository.updatePassword(resetToken.userId, passwordHash);
    await this.repository.deletePasswordResetToken(resetToken.id);
  }

  async resendVerification(data: ResendVerificationDto): Promise<void> {
    const user = await this.repository.findByEmail(data.email);
    // Silent no-op: do not reveal whether the email exists or is already verified (prevents user enumeration)
    if (!user || user.isActive) return;

    const rawToken = crypto.randomUUID();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.repository.createVerificationToken(user.id, tokenHash, expiresAt);

    await this.mailService.sendVerificationEmail(user.email!, rawToken, user.fullName || undefined);
  }

  async getActiveSessions(
    userId: string,
    currentToken?: string,
    query: SessionQueryDto = { page: 1, limit: 10 }
  ): Promise<SessionsResponseDto> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 10;

    await this.repository.cleanupExpiredSessions(userId);

    const { data: sessions, meta } = await this.repository.findSessionsByUserId(userId, { page, limit });
    const data = sessions.map((session) => ({
      id: session.id,
      deviceName: parseUserAgent(session.userAgent || undefined),
      ipAddress: session.ipAddress || 'Không rõ',
      createdAt: session.createdAt,
      isCurrent: currentToken ? session.token === currentToken : false,
    }));

    return {
      data,
      meta,
    };
  }

  async revokeSession(userId: string, sessionId: string) {
    const session = await this.repository.findSessionById(userId, sessionId);
    if (!session) {
      throw new AppError('Session not found', 404, ERROR_CODE.NOT_FOUND);
    }
    await this.repository.deleteSessionById(userId, sessionId);
  }

  async revokeAllOtherSessions(userId: string, currentToken: string) {
    await this.repository.deleteOtherSessions(userId, currentToken);
  }

  async loginWithZalo(
    dto: ZaloLoginDto,
    metadata?: { userAgent?: string; ipAddress?: string },
  ): Promise<LoginResponseDto> {
    const { accessToken } = dto;
    const appSecret = process.env.ZALO_APP_SECRET || '';
    const appsecretProof = appSecret
      ? crypto.createHmac('sha256', appSecret).update(accessToken).digest('hex')
      : '';

    // 1. Xác thực access_token và lấy thông tin Zalo profile (có fallback khi IP server ở nước ngoài)
    let zaloId = dto.zaloId || '';
    let zaloName = dto.name || 'Người dùng Zalo';
    let zaloAvatarUrl: string | null = dto.avatar || null;

    console.log('[ZaloAuth] Incoming login request:', {
      clientZaloId: dto.zaloId,
      clientName: dto.name,
      clientAvatar: dto.avatar,
      hasPhoneToken: Boolean(dto.phoneToken),
      hasPhoneNumber: Boolean(dto.phoneNumber),
    });

    try {
      const zaloProfile = await this.fetchZaloProfile(accessToken, appsecretProof);
      console.log('[ZaloAuth] fetchZaloProfile response:', zaloProfile);
      if (zaloProfile && zaloProfile.id) {
        zaloId = zaloProfile.id;
        if (zaloProfile.name) zaloName = zaloProfile.name;
        if (zaloProfile.picture?.data?.url) zaloAvatarUrl = zaloProfile.picture.data.url;
      } else if (zaloProfile?.error === -501) {
        console.warn('[ZaloAuth] Server IP is outside Vietnam (-501). Using client profile info.');
      } else if (zaloProfile && zaloProfile.error !== undefined && zaloProfile.error !== 0 && !dto.phoneToken) {
        console.error('[ZaloAuth] fetchZaloProfile failed:', zaloProfile);
        throw new AppError(
          zaloProfile?.message ? `Zalo Profile Error: ${zaloProfile.message}` : 'Invalid Zalo access token',
          401,
          ERROR_CODE.INVALID_CREDENTIALS,
        );
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      console.warn('[ZaloAuth] fetchZaloProfile caught error:', err);
    }

    // 2. Lấy và chuẩn hóa số điện thoại (từ phoneToken hoặc phoneNumber nếu có thể giải mã)
    let resolvedPhone = dto.phoneNumber;

    if (dto.phoneToken) {
      try {
        const phoneResponse = await this.fetchZaloPhoneNumber(accessToken, dto.phoneToken, appSecret, appsecretProof);
        console.log('[ZaloAuth] fetchZaloPhoneNumber response:', phoneResponse);
        if (phoneResponse && phoneResponse.data?.number) {
          resolvedPhone = phoneResponse.data.number;
        } else if (phoneResponse?.error === -501) {
          console.warn('[ZaloAuth] Zalo Phone API limited by IP location (-501). Authenticating via Zalo ID.');
        } else if (phoneResponse && phoneResponse.error !== undefined && phoneResponse.error !== 0) {
          console.warn('[ZaloAuth] fetchZaloPhoneNumber returned error:', phoneResponse);
        }
      } catch (err) {
        console.warn('[ZaloAuth] fetchZaloPhoneNumber caught error:', err);
      }
    }

    if (resolvedPhone) {
      // Chuẩn hóa số điện thoại: +84... hoặc 84... -> 0...
      resolvedPhone = resolvedPhone.replace(/^\+84/, '0').replace(/^84/, '0');
    }

    // Đảm bảo luôn có Zalo ID làm mã định danh tài khoản
    if (!zaloId) {
      if (resolvedPhone) {
        zaloId = `zalo_${resolvedPhone}`;
      } else if (dto.phoneToken) {
        const tokenHash = crypto.createHash('sha256').update(dto.phoneToken).digest('hex').substring(0, 16);
        zaloId = `zalo_tok_${tokenHash}`;
      } else {
        const accHash = crypto.createHash('sha256').update(accessToken).digest('hex').substring(0, 16);
        zaloId = `zalo_acc_${accHash}`;
      }
    }

    // 3. Tìm hoặc tạo user
    // A. Tìm theo liên kết mạng xã hội Zalo ID trước
    let user: any = await this.repository.findBySocial('zalo', zaloId);

    // B. Nếu chưa tìm thấy theo Zalo ID và có SĐT, tìm theo SĐT
    if (!user && resolvedPhone) {
      user = await this.repository.findByPhone(resolvedPhone);
      if (user) {
        await this.repository.linkSocialAccount(user.id, 'zalo', zaloId);
      }
    }

    // C. Nếu user chưa tồn tại, tạo mới
    if (!user) {
      const role = await this.repository.findRoleByName(SYSTEM_ROLES.USER);
      if (!role) {
        throw new AppError('Default role not found', 500, ERROR_CODE.INTERNAL_SERVER_ERROR);
      }
      user = await this.repository.createSocialUser({
        fullName: zaloName || 'Người dùng Zalo',
        avatarUrl: zaloAvatarUrl || undefined,
        phoneNumber: resolvedPhone || undefined,
        roleId: role.id,
        provider: 'zalo',
        providerUserId: zaloId,
      });
      console.log('[ZaloAuth] Created new user:', user.id);
    } else {
      // User đã tồn tại: Tự động cập nhật SĐT nếu có resolvedPhone mà user chưa có hoặc khác SĐT cũ
      const updateData: { phoneNumber?: string; fullName?: string; avatarUrl?: string } = {};

      if (resolvedPhone && user.phoneNumber !== resolvedPhone) {
        // Kiểm tra xem số điện thoại này có đang thuộc về tài khoản khác không để tránh lỗi Unique constraint
        const existingPhoneUser = await this.repository.findByPhone(resolvedPhone);
        if (!existingPhoneUser || existingPhoneUser.id === user.id) {
          updateData.phoneNumber = resolvedPhone;
        } else {
          console.warn(`[ZaloAuth] Phone number ${resolvedPhone} is already linked to another user ${existingPhoneUser.id}`);
        }
      }

      // Cập nhật tên nếu có tên Zalo hợp lệ (khác placeholder) và user chưa có hoặc đang là placeholder
      if (zaloName && zaloName !== 'Người dùng Zalo' && (!user.fullName || user.fullName === 'Người dùng Zalo' || user.fullName !== zaloName)) {
        updateData.fullName = zaloName;
      }
      if (zaloAvatarUrl && (!user.avatarUrl || user.avatarUrl !== zaloAvatarUrl)) {
        updateData.avatarUrl = zaloAvatarUrl;
      }

      if (Object.keys(updateData).length > 0) {
        console.log(`[ZaloAuth] Updating existing user ${user.id} with:`, updateData);
        try {
          user = await this.repository.updateProfile(user.id, updateData);
          console.log(`[ZaloAuth] Successfully updated user ${user.id}`);
        } catch (updateErr) {
          console.warn('[ZaloAuth] Failed to update user profile with resolved Zalo info:', updateErr);
        }
      } else {
        console.log(`[ZaloAuth] No new data to update for user ${user.id}`);
      }
    }

    // Load role relation nếu chưa có (createSocialUser đã include)
    const userWithRole = await this.repository.findById(user.id);
    if (!userWithRole || !userWithRole.isActive) {
      throw new AppError('User not found or inactive', 401, ERROR_CODE.USER_INACTIVE);
    }

    // 3. Tạo JWT tokens
    const payload = { id: userWithRole.id, email: userWithRole.email, role: userWithRole.role.name };

    const newAccessToken = jwt.sign(payload, jwtConfig.accessSecret, {
      expiresIn: jwtConfig.accessExpiresIn as any,
    });

    const refreshToken = jwt.sign(
      { ...payload, jti: crypto.randomUUID() },
      jwtConfig.refreshSecret,
      { expiresIn: jwtConfig.refreshExpiresIn as any },
    );

    const decoded = jwt.decode(refreshToken) as { exp: number };
    const expiresAt = new Date(decoded.exp * 1000);

    await this.repository.saveRefreshToken(
      userWithRole.id,
      refreshToken,
      expiresAt,
      metadata?.userAgent,
      metadata?.ipAddress,
    );

    await this.repository.cleanupExpiredSessions(userWithRole.id);
    await this.repository.enforceSessionLimit(userWithRole.id, 10);

    const permissions = await rbacService.getUserPermissions(userWithRole.id);

    return {
      user: {
        id: userWithRole.id,
        email: userWithRole.email,
        fullName: userWithRole.fullName,
        avatarUrl: userWithRole.avatarUrl,
        avatarPositionX: userWithRole.avatarPositionX,
        avatarPositionY: userWithRole.avatarPositionY,
        phoneNumber: userWithRole.phoneNumber,
        roleId: userWithRole.roleId,
        role: {
          id: userWithRole.role.id,
          name: userWithRole.role.name,
          description: userWithRole.role.description,
          isSystem: userWithRole.role.isSystem,
        },
        permissions,
        isActive: userWithRole.isActive,
        createdAt: userWithRole.createdAt,
        updatedAt: userWithRole.updatedAt,
      },
      accessToken: newAccessToken,
      refreshToken,
    };
  }

  private fetchZaloProfile(
    accessToken: string,
    appsecretProof: string,
  ): Promise<ZaloProfileResponse> {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'graph.zalo.me',
        path: '/v2.0/me?fields=id,name,picture',
        method: 'GET',
        headers: {
          access_token: accessToken,
          appsecret_proof: appsecretProof,
        },
      };
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data) as ZaloProfileResponse);
          } catch {
            reject(new Error('Failed to parse Zalo API response'));
          }
        });
      });
      req.on('error', reject);
      req.end();
    });
  }

  private fetchZaloPhoneNumber(
    accessToken: string,
    phoneToken: string,
    appSecret: string,
    appsecretProof?: string,
  ): Promise<ZaloPhoneResponse> {
    return new Promise((resolve, reject) => {
      const proof =
        appsecretProof ||
        (appSecret ? crypto.createHmac('sha256', appSecret).update(accessToken).digest('hex') : '');

      const headers: Record<string, string> = {
        access_token: accessToken,
        code: phoneToken,
        secret_key: appSecret,
      };

      if (proof) {
        headers.appsecret_proof = proof;
      }

      const options = {
        hostname: 'graph.zalo.me',
        path: '/v2.0/me/info',
        method: 'GET',
        headers,
      };
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data) as ZaloPhoneResponse);
          } catch {
            reject(new Error('Failed to parse Zalo Phone API response'));
          }
        });
      });
      req.on('error', reject);
      req.end();
    });
  }
}
