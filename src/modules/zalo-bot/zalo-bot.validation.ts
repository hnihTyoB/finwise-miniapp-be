import { z } from 'zod';

const idCoerce = z.union([z.string(), z.number()]).transform((v) => String(v));

export const zaloWebhookMessageSchema = z
  .object({
    id: idCoerce.optional(),
    message_id: idCoerce.optional(),
    msg_id: idCoerce.optional(),
    text: z.string().optional().default(''),
    caption: z.string().optional(),
    date: z.number().optional(),
    from: z
      .object({
        id: idCoerce.optional(),
        name: z.string().optional(),
        display_name: z.string().optional(),
        is_bot: z.boolean().optional(),
      })
      .passthrough()
      .optional(),
    from_id: idCoerce.optional(),
    chat: z
      .object({
        id: idCoerce.optional(),
        chat_type: z.string().optional(),
      })
      .passthrough()
      .optional(),
    chat_id: idCoerce.optional(),
    reply_to_message_id: idCoerce.optional(),
    reply_to_msg_id: idCoerce.optional(),
    quote_message_id: idCoerce.optional(),
    quote_msg_id: idCoerce.optional(),
    reply_to_message: z.any().optional(),
    replied_to_message: z.any().optional(),
    quote: z.any().optional(),
    quoted_message: z.any().optional(),
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
