import { z } from 'zod';

export const zaloWebhookMessageSchema = z
  .object({
    id: z.string().optional(),
    message_id: z.string().optional(),
    text: z.string().optional().default(''),
    caption: z.string().optional(),
    date: z.number().optional(),
    from: z
      .object({
        id: z.string().optional(),
        name: z.string().optional(),
        display_name: z.string().optional(),
        is_bot: z.boolean().optional(),
      })
      .passthrough()
      .optional(),
    from_id: z.string().optional(),
    chat: z
      .object({
        id: z.string().optional(),
        chat_type: z.string().optional(),
      })
      .passthrough()
      .optional(),
    chat_id: z.string().optional(),
    reply_to_message_id: z.string().optional(),
    replied_to_message: z
      .object({
        message_id: z.string().optional(),
        id: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const zaloWebhookPayloadSchema = z
  .object({
    ok: z.boolean().optional(),
    event_name: z.string().optional(),
    message: z.union([zaloWebhookMessageSchema, z.string()]).optional(),
    result: z
      .object({
        event_name: z.string().optional(),
        message: z.union([zaloWebhookMessageSchema, z.string()]).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type ZaloWebhookPayload = z.infer<typeof zaloWebhookPayloadSchema>;
export type ZaloWebhookMessage = z.infer<typeof zaloWebhookMessageSchema>;
