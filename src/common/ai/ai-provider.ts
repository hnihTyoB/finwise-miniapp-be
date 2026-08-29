export interface AIInlineData {
  mimeType: string;
  data: string;
}

export type AIContentPart =
  | { text: string }
  | { inlineData: AIInlineData };

export interface AIGenerateRequest {
  systemInstruction: string;
  parts: AIContentPart[];
  responseJsonSchema: Record<string, unknown>;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface AIUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
}

export interface AIGenerateResponse {
  data: unknown;
  provider: string;
  model: string;
  usage: AIUsage;
}

export type AIProviderErrorReason =
  | 'NOT_CONFIGURED'
  | 'UNAVAILABLE'
  | 'INVALID_RESPONSE';

export class AIProviderError extends Error {
  constructor(public readonly reason: AIProviderErrorReason, message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface AIProvider {
  readonly name: string;
  readonly model: string;
  generateStructured(request: AIGenerateRequest): Promise<AIGenerateResponse>;
}
