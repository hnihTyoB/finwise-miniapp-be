export interface LoginDto {
  email: string;
  account?: string;
  password: string;
}

export interface ZaloLoginDto {
  accessToken: string;   // Zalo access_token từ getAccessToken() SDK
  phoneToken?: string;   // Mã token SĐT từ getPhoneNumber() SDK (giải mã phía server)
  phoneNumber?: string;  // SĐT thực trực tiếp (cho test/fallback)
  zaloId?: string;       // User ID từ getUserInfo SDK client
  name?: string;         // Tên user từ getUserInfo SDK client
  avatar?: string;       // Avatar từ getUserInfo SDK client
}

export interface ZaloPhoneResponse {
  data?: {
    number?: string;
  };
  error?: number;
  message?: string;
}

export interface ZaloProfileResponse {
  id: string;
  name?: string;
  picture?: {
    data?: {
      url?: string;
    };
  };
  error?: number;
  message?: string;
  is_sensitive?: boolean;
}

export interface RegisterDto {
  email: string;
  password: string;
  fullName?: string;
}

export interface AuthTokensDto {
  accessToken: string;
  refreshToken: string;
}

export interface MeDto {
  id: string;
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  avatarPositionX: number;
  avatarPositionY: number;
  phoneNumber: string | null;
  roleId: string;
  role: {
    id: string;
    name: string;
    description?: string | null;
    isSystem?: boolean;
  };
  permissions: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface LoginResponseDto {
  accessToken: string;
  refreshToken: string;
  user: MeDto;
}

export interface UpdateProfileDto {
  fullName?: string;
  phoneNumber?: string;
}

export interface UpdateAvatarDto {
  avatarUrl: string | null;
  avatarPositionX?: number;
  avatarPositionY?: number;
}

export interface UpdatePasswordDto {
  oldPassword?: string;
  newPassword: string;
}

export interface ForgotPasswordDto {
  email: string;
}

export interface ResetPasswordDto {
  token: string;
  newPassword: string;
}

export interface ResendVerificationDto {
  email: string;
}

export interface SessionQueryDto {
  page?: number;
  limit?: number;
}

export interface SessionItemDto {
  id: string;
  deviceName: string;
  ipAddress: string;
  createdAt: Date;
  isCurrent: boolean;
}

export interface SessionsResponseDto {
  data: SessionItemDto[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

