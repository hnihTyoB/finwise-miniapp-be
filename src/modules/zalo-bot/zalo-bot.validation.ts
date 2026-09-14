import { z } from 'zod';

export const zaloWebhookMessageSchema = z.object({
  from: z.object({
    id: z.string().min(1),
    display_name: z.string().optional().default('Người dùng'),
    is_bot: z.boolean().optional().default(false),
  }),
  chat: z.object({
    id: z.string().min(1),
    chat_type: z.string().optional().default('PRIVATE'),
  }),
  text: z.string().optional().default(''),
  message_id: z.string().optional(),
  date: z.number().optional(),
});

export const zaloWebhookPayloadSchema = z.object({
  ok: z.boolean().optional().default(true),
  result: z.object({
    event_name: z.string(),
    message: zaloWebhookMessageSchema.optional(),
  }).optional(),
});

export type ZaloWebhookPayload = z.infer<typeof zaloWebhookPayloadSchema>;
export type ZaloWebhookMessage = z.infer<typeof zaloWebhookMessageSchema>;
