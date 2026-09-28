import { z } from 'zod';

const idCoerce = z.union([z.string(), z.number()]).transform((v) => String(v));

export const zaloQuoteReplySchema = z.union([
  z
    .object({
      id: idCoerce.optional(),
      message_id: idCoerce.optional(),
      messageId: idCoerce.optional(),
      msg_id: idCoerce.optional(),
      msgId: idCoerce.optional(),
      quote_id: idCoerce.optional(),
      quoteId: idCoerce.optional(),
      quote_msg_id: idCoerce.optional(),
      quote_message_id: idCoerce.optional(),
      quoteMessageId: idCoerce.optional(),
      text: z.string().optional(),
      message: z
        .object({
          id: idCoerce.optional(),
          message_id: idCoerce.optional(),
          messageId: idCoerce.optional(),
          msg_id: idCoerce.optional(),
          msgId: idCoerce.optional(),
          text: z.string().optional(),
        })
        .passthrough()
        .optional(),
    })
    .passthrough(),
  idCoerce,
]);

export const zaloWebhookMessageSchema = z
  .object({
    id: idCoerce.optional(),
    message_id: idCoerce.optional(),
    messageId: idCoerce.optional(),
    msg_id: idCoerce.optional(),
    msgId: idCoerce.optional(),
    text: z.string().optional().default(''),
    caption: z.string().optional(),
    date: z.union([z.number(), z.string()]).optional(),
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
    fromUser: z
      .object({
        id: idCoerce.optional(),
        name: z.string().optional(),
        display_name: z.string().optional(),
      })
      .passthrough()
      .optional(),
    chat: z
      .object({
        id: idCoerce.optional(),
        chat_type: z.string().optional(),
      })
      .passthrough()
      .optional(),
    chat_id: idCoerce.optional(),
    chatId: idCoerce.optional(),
    reply_to: zaloQuoteReplySchema.optional(),
    replyTo: zaloQuoteReplySchema.optional(),
    reply_to_message: zaloQuoteReplySchema.optional(),
    replyToMessage: zaloQuoteReplySchema.optional(),
    replied_to_message: zaloQuoteReplySchema.optional(),
    repliedToMessage: zaloQuoteReplySchema.optional(),
    quote: zaloQuoteReplySchema.optional(),
    quoted: zaloQuoteReplySchema.optional(),
    quote_message: zaloQuoteReplySchema.optional(),
    quoteMessage: zaloQuoteReplySchema.optional(),
    quoted_message: zaloQuoteReplySchema.optional(),
    quotedMessage: zaloQuoteReplySchema.optional(),
    reply_to_message_id: idCoerce.optional(),
    reply_to_msg_id: idCoerce.optional(),
    replyToMessageId: idCoerce.optional(),
    replyToMsgId: idCoerce.optional(),
    reply_msg_id: idCoerce.optional(),
    reply_message_id: idCoerce.optional(),
    replyMsgId: idCoerce.optional(),
    replyMessageId: idCoerce.optional(),
    quote_message_id: idCoerce.optional(),
    quote_msg_id: idCoerce.optional(),
    quoteMessageId: idCoerce.optional(),
    quoteMsgId: idCoerce.optional(),
    quote_id: idCoerce.optional(),
    quoteId: idCoerce.optional(),
    parent_id: idCoerce.optional(),
    parentId: idCoerce.optional(),
    parent_msg_id: idCoerce.optional(),
    parentMsgId: idCoerce.optional(),
    parent_message_id: idCoerce.optional(),
    parentMessageId: idCoerce.optional(),
  })
  .passthrough();

export const zaloWebhookPayloadSchema = z
  .object({
    ok: z.boolean().optional(),
    event_name: z.string().optional(),
    eventName: z.string().optional(),
    message: z.union([zaloWebhookMessageSchema, z.string()]).optional(),
    reply_to: zaloQuoteReplySchema.optional(),
    replyTo: zaloQuoteReplySchema.optional(),
    reply_to_message: zaloQuoteReplySchema.optional(),
    quote: zaloQuoteReplySchema.optional(),
    quoted_message: zaloQuoteReplySchema.optional(),
    quote_message_id: idCoerce.optional(),
    quote_msg_id: idCoerce.optional(),
    quoteMessageId: idCoerce.optional(),
    quoteMsgId: idCoerce.optional(),
    reply_to_message_id: idCoerce.optional(),
    reply_to_msg_id: idCoerce.optional(),
    replyToMessageId: idCoerce.optional(),
    replyToMsgId: idCoerce.optional(),
    result: z
      .object({
        event_name: z.string().optional(),
        eventName: z.string().optional(),
        message: z.union([zaloWebhookMessageSchema, z.string()]).optional(),
        message_id: idCoerce.optional(),
        messageId: idCoerce.optional(),
        msg_id: idCoerce.optional(),
        msgId: idCoerce.optional(),
        reply_to: zaloQuoteReplySchema.optional(),
        replyTo: zaloQuoteReplySchema.optional(),
        reply_to_message: zaloQuoteReplySchema.optional(),
        replyToMessage: zaloQuoteReplySchema.optional(),
        replied_to_message: zaloQuoteReplySchema.optional(),
        repliedToMessage: zaloQuoteReplySchema.optional(),
        quote: zaloQuoteReplySchema.optional(),
        quote_message: zaloQuoteReplySchema.optional(),
        quoteMessage: zaloQuoteReplySchema.optional(),
        quoted_message: zaloQuoteReplySchema.optional(),
        quotedMessage: zaloQuoteReplySchema.optional(),
        reply_to_message_id: idCoerce.optional(),
        reply_to_msg_id: idCoerce.optional(),
        replyToMessageId: idCoerce.optional(),
        replyToMsgId: idCoerce.optional(),
        quote_message_id: idCoerce.optional(),
        quote_msg_id: idCoerce.optional(),
        quoteMessageId: idCoerce.optional(),
        quoteMsgId: idCoerce.optional(),
      })
      .passthrough()
      .optional(),
    data: z
      .object({
        event_name: z.string().optional(),
        eventName: z.string().optional(),
        message: z.union([zaloWebhookMessageSchema, z.string()]).optional(),
        quote_message_id: idCoerce.optional(),
        quote_msg_id: idCoerce.optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type ZaloWebhookPayload = z.infer<typeof zaloWebhookPayloadSchema>;
export type ZaloWebhookMessage = z.infer<typeof zaloWebhookMessageSchema>;
