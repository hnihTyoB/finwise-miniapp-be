import { z } from 'zod';
import { validateUrl } from '../../common/helpers/url.helper';

export const createWebhookSchema = z.object({
  url: z
    .string()
    .url('Invalid URL format')
    .max(500, 'URL too long')
    .refine(
      (url) => {
        try {
          validateUrl(url);
          return true;
        } catch {
          return false;
        }
      },
      { message: 'Webhook URL must be a valid public HTTP or HTTPS URL (private IPs/localhost not allowed)' },
    ),
  description: z.string().max(255).optional(),
  events: z.array(z.string()).min(1, 'At least one event is required').optional(),
});

export const updateWebhookSchema = z.object({
  url: z
    .string()
    .url('Invalid URL format')
    .max(500, 'URL too long')
    .refine(
      (url) => {
        try {
          validateUrl(url);
          return true;
        } catch {
          return false;
        }
      },
      { message: 'Webhook URL must be a valid public HTTP or HTTPS URL (private IPs/localhost not allowed)' },
    )
    .optional(),
  description: z.string().max(255).optional(),
  events: z.array(z.string()).min(1).optional(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
});

export const webhookParamSchema = z.object({
  id: z.string().uuid('Invalid Webhook ID'),
});

export const webhookDeliveryParamSchema = z.object({
  id: z.string().uuid('Invalid Webhook ID'),
  deliveryId: z.string().uuid('Invalid Webhook Delivery ID'),
});
