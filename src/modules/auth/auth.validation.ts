import { z } from 'zod';
import { validateUrl } from '../../common/helpers/url.helper';

export const loginSchema = z
  .object({
    email: z.string().optional(),
    account: z.string().optional(),
    password: z.string().min(1, 'Password is required'),
  })
  .refine((data) => Boolean((data.email && data.email.trim().length > 0) || (data.account && data.account.trim().length > 0)), {
    message: 'Email or account is required',
    path: ['email'],
  })
  .transform((data) => ({
    email: (data.email || data.account)!.trim(),
    password: data.password,
  }));

export const zaloLoginSchema = z
  .object({
    accessToken: z.string().min(1, 'Zalo access token is required'),
    phoneToken: z.string().min(1, 'Phone token must not be empty').optional(),
    phoneNumber: z
      .string()
      .regex(/^(0[3|5|7|8|9])+([0-9]{8})$/, 'Invalid Vietnamese phone number format')
      .optional(),
    zaloId: z.string().optional(),
    name: z.string().optional(),
    avatar: z.string().optional(),
  })
  .refine((data) => data.phoneToken || data.phoneNumber || data.zaloId, {
    message: 'Either phoneToken, phoneNumber, or zaloId must be provided',
    path: ['accessToken'],
  });

export const refreshSchema = z.object({
  refreshToken: z.string().optional(),
});

export const logoutSchema = z.object({
  refreshToken: z.string().optional(),
});

export const registerSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Invalid email format')
    .transform((val) => val.trim().toLowerCase()),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^a-zA-Z0-9]/, 'Password must contain at least one special character'),
  fullName: z.string().optional(),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
});

export const updateProfileSchema = z.object({
  fullName: z.string().min(1, 'Full name cannot be empty').optional(),
  phoneNumber: z
    .union([
      z.string().regex(/^[0-9]{10,11}$/, 'Invalid phone number format (must be 10-11 digits)'),
      z.literal('').transform(() => null),
      z.null(),
    ])
    .optional(),
});

export const updateAvatarSchema = z.object({
  avatarUrl: z
    .union([
      z
        .string()
        .url('Invalid avatar URL format')
        .refine(
          (url) => {
            try { validateUrl(url); return true; } catch { return false; }
          },
          { message: 'Avatar URL must be a public HTTP/HTTPS URL (private IPs not allowed)' },
        ),
      z.null(),
      z.literal('').transform(() => null),
    ]),
  avatarPositionX: z.number().int().min(0).max(100).optional(),
  avatarPositionY: z.number().int().min(0).max(100).optional(),
});

export const updatePasswordSchema = z.object({
  oldPassword: z.string().optional(),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^a-zA-Z0-9]/, 'Password must contain at least one special character'),
});

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Invalid email format')
    .transform((val) => val.trim().toLowerCase()),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^a-zA-Z0-9]/, 'Password must contain at least one special character'),
});

export const resendVerificationSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Invalid email format')
    .transform((val) => val.trim().toLowerCase()),
});

export const sessionParamsSchema = z.object({
  id: z.string().uuid('Invalid session id'),
});

export const sessionQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(10),
});

export const revokeOtherSessionsSchema = z.object({
  refreshToken: z.string().optional(),
});
