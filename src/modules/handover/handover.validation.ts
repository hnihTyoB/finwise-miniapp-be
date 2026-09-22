import { z } from 'zod';

export const claimHandoverSchema = z
  .object({
    handoverToken: z.string().trim().min(10).optional(),
    signature: z.string().trim().optional(),
    pinCode: z
      .string()
      .trim()
      .regex(/^[0-9]{6}$/, 'Mã PIN phải gồm đúng 6 chữ số')
      .optional(),
  })
  .refine((data) => Boolean(data.handoverToken || data.pinCode), {
    message: 'Phải cung cấp handoverToken từ mã QR hoặc mã PIN 6 chữ số',
  });

export const confirmHandoverSchema = z.object({
  handoverToken: z.string().trim().min(10, 'handoverToken không hợp lệ'),
  otp: z
    .string()
    .trim()
    .regex(/^[0-9]{6}$/, 'Mã OTP phải gồm đúng 6 chữ số'),
});

export const cancelHandoverSchema = z.object({
  handoverToken: z.string().trim().min(10).optional(),
});

export const handoverResultParamsSchema = z.object({
  handoverToken: z.string().trim().min(10, 'handoverToken không hợp lệ'),
});
