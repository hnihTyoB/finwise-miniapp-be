import { z } from 'zod';

const MONEY_PATTERN = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/;

const cleanMoneyString = (val: unknown): unknown => {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val.toFixed(2).replace(/\.00$/, '') : null;
  }
  if (typeof val === 'string') {
    let cleaned = val.replace(/[,\s_đ₫VND$USD]/gi, '').trim();
    if (!cleaned) return null;

    // Detect and remove Vietnamese/European thousand separator dots (e.g. "159.500", "1.500.000", "38.000")
    if (/\.\d{3}(\.|$)/.test(cleaned)) {
      cleaned = cleaned.replace(/\./g, '');
    }

    if (MONEY_PATTERN.test(cleaned)) {
      return cleaned;
    }

    // If still has decimal or trailing digits
    const numericMatch = cleaned.match(/^\d+(\.\d{1,2})?/);
    return numericMatch ? numericMatch[0] : null;
  }
  return val;
};

const cleanStringOrNull = (val: unknown): unknown => {
  if (val === null || val === undefined) return null;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return String(val);
};

const cleanQuantity = (val: unknown): unknown => {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return Math.max(0, val);
  if (typeof val === 'string') {
    const parsed = parseFloat(val);
    return isNaN(parsed) ? null : Math.max(0, parsed);
  }
  return null;
};

const cleanConfidence = (val: unknown): unknown => {
  if (typeof val === 'number') return Math.min(1, Math.max(0, val));
  if (typeof val === 'string') {
    const parsed = parseFloat(val);
    return isNaN(parsed) ? 0.9 : Math.min(1, Math.max(0, parsed));
  }
  return 0.9;
};

const cleanDateString = (val: unknown): unknown => {
  if (typeof val === 'string') {
    const isoMatch = val.match(/\d{4}-\d{2}-\d{2}/);
    if (isoMatch) return isoMatch[0];
    const vnMatch = val.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (vnMatch) {
      const day = vnMatch[1].padStart(2, '0');
      const month = vnMatch[2].padStart(2, '0');
      const year = vnMatch[3];
      return `${year}-${month}-${day}`;
    }
  }
  return null;
};

const moneySchema = z.preprocess(cleanMoneyString, z.string().regex(MONEY_PATTERN));
const nullableMoneySchema = z.preprocess(cleanMoneyString, z.string().regex(MONEY_PATTERN).nullable());

const directionSchema = z.preprocess(
  (val) => (typeof val === 'string' ? val.toUpperCase().trim() : val),
  z.enum(['UP', 'DOWN', 'STABLE'])
);

const severitySchema = z.preprocess(
  (val) => (typeof val === 'string' ? val.toUpperCase().trim() : val),
  z.enum(['LOW', 'MEDIUM', 'HIGH'])
);

const prioritySchema = z.preprocess(
  (val) => (typeof val === 'string' ? val.toUpperCase().trim() : val),
  z.enum(['LOW', 'MEDIUM', 'HIGH'])
);

const currencySchema = z.preprocess(
  (val) => (typeof val === 'string' ? val.toUpperCase().trim() : 'VND'),
  z.string().regex(/^[A-Z]{3}$/)
);

const nullableCurrencySchema = z.preprocess(
  (val) => (typeof val === 'string' ? val.toUpperCase().trim() : 'VND'),
  z.string().regex(/^[A-Z]{3}$/).nullable()
);

export type AIResponseValidator<T> = z.ZodType<T>;

export const classificationResponseSchema = z.object({
  categoryId: z.string().uuid(),
  confidence: z.preprocess(cleanConfidence, z.number().min(0).max(1)),
  reasoning: z.string().trim().min(1).max(1000),
});

export const receiptResponseSchema = z.object({
  merchant: z.preprocess(cleanStringOrNull, z.string().trim().max(300).nullable()),
  transactionDate: z.preprocess(cleanDateString, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()),
  totalAmount: nullableMoneySchema,
  currency: nullableCurrencySchema,
  taxAmount: nullableMoneySchema,
  categoryId: z.preprocess(cleanStringOrNull, z.string().nullable()),
  lineItems: z.preprocess(
    (val) => (Array.isArray(val) ? val : []),
    z.array(z.object({
      name: z.string().trim().min(1).max(300),
      quantity: z.preprocess(cleanQuantity, z.number().nonnegative().nullable()),
      unitPrice: nullableMoneySchema,
      totalAmount: nullableMoneySchema,
    })).max(100)
  ),
  rawText: z.preprocess((val) => (typeof val === 'string' ? val : ''), z.string().max(8000)),
  confidence: z.preprocess(cleanConfidence, z.number().min(0).max(1)),
  warnings: z.preprocess(
    (val) => (Array.isArray(val) ? val : []),
    z.array(z.string().trim().min(1).max(500)).max(10)
  ),
});

export const chatResponseSchema = z.object({
  answer: z.string().trim().min(1).max(5000),
  highlights: z.preprocess(
    (val) => (Array.isArray(val) ? val : []),
    z.array(z.string().trim().min(1).max(500)).max(8)
  ),
  caveats: z.preprocess(
    (val) => (Array.isArray(val) ? val : []),
    z.array(z.string().trim().min(1).max(500)).max(8)
  ),
  suggestedActions: z.preprocess(
    (val) => (Array.isArray(val) ? val : []),
    z.array(z.string().trim().min(1).max(500)).max(8)
  ),
});

export const insightsResponseSchema = z.object({
  summary: z.string().trim().min(1).max(3000),
  trends: z.preprocess(
    (val) => (Array.isArray(val) ? val : []),
    z.array(z.object({
      title: z.string().trim().min(1).max(200),
      direction: directionSchema,
      description: z.string().trim().min(1).max(1000),
      evidence: z.string().trim().min(1).max(1000),
    })).max(8)
  ),
  anomalies: z.preprocess(
    (val) => (Array.isArray(val) ? val : []),
    z.array(z.object({
      title: z.string().trim().min(1).max(200),
      severity: severitySchema,
      description: z.string().trim().min(1).max(1000),
      evidence: z.string().trim().min(1).max(1000),
    })).max(8)
  ),
  recommendations: z.preprocess(
    (val) => (Array.isArray(val) ? val : []),
    z.array(z.object({
      title: z.string().trim().min(1).max(200),
      priority: prioritySchema,
      description: z.string().trim().min(1).max(1000),
    })).max(8)
  ),
});

export const recommendationsResponseSchema = z.object({
  summary: z.string().trim().min(1).max(3000),
  budgetRecommendations: z.preprocess(
    (val) => (Array.isArray(val) ? val : []),
    z.array(z.object({
      categoryName: z.preprocess(cleanStringOrNull, z.string().trim().min(1).max(200).nullable()),
      currency: currencySchema,
      suggestedLimit: moneySchema,
      rationale: z.string().trim().min(1).max(1000),
    })).max(10)
  ),
  savingRecommendations: z.preprocess(
    (val) => (Array.isArray(val) ? val : []),
    z.array(z.object({
      goalName: z.preprocess(cleanStringOrNull, z.string().trim().min(1).max(200).nullable()),
      currency: currencySchema,
      suggestedMonthlyContribution: moneySchema,
      rationale: z.string().trim().min(1).max(1000),
    })).max(10)
  ),
  actions: z.preprocess(
    (val) => (Array.isArray(val) ? val : []),
    z.array(z.object({
      title: z.string().trim().min(1).max(200),
      priority: prioritySchema,
      description: z.string().trim().min(1).max(1000),
    })).max(10)
  ),
});

export const exchangeRateResponseSchema = z.object({
  from: currencySchema,
  to: currencySchema,
  rate: z.preprocess(
    (val) => (typeof val === 'string' ? parseFloat(val) : val),
    z.number().positive(),
  ),
  note: z.preprocess(cleanStringOrNull, z.string().trim().max(500).nullable()).optional(),
});
