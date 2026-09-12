export const classificationJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['categoryId', 'confidence', 'reasoning'],
  properties: {
    categoryId: { type: 'string' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    reasoning: { type: 'string' },
  },
} satisfies Record<string, unknown>;

export const receiptJsonSchema = {
  type: 'object',
  required: [
    'merchant',
    'transactionDate',
    'totalAmount',
    'currency',
    'taxAmount',
    'categoryId',
    'lineItems',
    'rawText',
    'confidence',
    'warnings',
  ],
  properties: {
    merchant: { type: 'string', nullable: true },
    transactionDate: { type: 'string', nullable: true },
    totalAmount: { type: 'string', nullable: true },
    currency: { type: 'string', nullable: true },
    taxAmount: { type: 'string', nullable: true },
    categoryId: { type: 'string', nullable: true },
    lineItems: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'quantity', 'unitPrice', 'totalAmount'],
        properties: {
          name: { type: 'string' },
          quantity: { type: 'number', nullable: true },
          unitPrice: { type: 'string', nullable: true },
          totalAmount: { type: 'string', nullable: true },
        },
      },
    },
    rawText: { type: 'string' },
    confidence: { type: 'number' },
    warnings: { type: 'array', items: { type: 'string' } },
  },
} satisfies Record<string, unknown>;

export const chatJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['answer', 'highlights', 'caveats', 'suggestedActions'],
  properties: {
    answer: { type: 'string' },
    highlights: { type: 'array', maxItems: 8, items: { type: 'string' } },
    caveats: { type: 'array', maxItems: 8, items: { type: 'string' } },
    suggestedActions: { type: 'array', maxItems: 8, items: { type: 'string' } },
  },
} satisfies Record<string, unknown>;

export const insightsJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'trends', 'anomalies', 'recommendations'],
  properties: {
    summary: { type: 'string' },
    trends: {
      type: 'array',
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'direction', 'description', 'evidence'],
        properties: {
          title: { type: 'string' },
          direction: { type: 'string', enum: ['UP', 'DOWN', 'STABLE'] },
          description: { type: 'string' },
          evidence: { type: 'string' },
        },
      },
    },
    anomalies: {
      type: 'array',
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'severity', 'description', 'evidence'],
        properties: {
          title: { type: 'string' },
          severity: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
          description: { type: 'string' },
          evidence: { type: 'string' },
        },
      },
    },
    recommendations: {
      type: 'array',
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'priority', 'description'],
        properties: {
          title: { type: 'string' },
          priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
          description: { type: 'string' },
        },
      },
    },
  },
} satisfies Record<string, unknown>;

export const recommendationsJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'budgetRecommendations', 'savingRecommendations', 'actions'],
  properties: {
    summary: { type: 'string' },
    budgetRecommendations: {
      type: 'array',
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['categoryName', 'currency', 'suggestedLimit', 'rationale'],
        properties: {
          categoryName: { type: ['string', 'null'] },
          currency: { type: 'string' },
          suggestedLimit: { type: 'string' },
          rationale: { type: 'string' },
        },
      },
    },
    savingRecommendations: {
      type: 'array',
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['goalName', 'currency', 'suggestedMonthlyContribution', 'rationale'],
        properties: {
          goalName: { type: ['string', 'null'] },
          currency: { type: 'string' },
          suggestedMonthlyContribution: { type: 'string' },
          rationale: { type: 'string' },
        },
      },
    },
    actions: {
      type: 'array',
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'priority', 'description'],
        properties: {
          title: { type: 'string' },
          priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
          description: { type: 'string' },
        },
      },
    },
  },
} satisfies Record<string, unknown>;

export const exchangeRateJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['from', 'to', 'rate', 'note'],
  properties: {
    from: { type: 'string' },
    to: { type: 'string' },
    rate: { type: 'number' },
    note: { type: 'string' },
  },
} satisfies Record<string, unknown>;
