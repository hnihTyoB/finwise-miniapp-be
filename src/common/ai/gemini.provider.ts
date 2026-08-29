import {
  AIGenerateRequest,
  AIGenerateResponse,
  AIProvider,
  AIProviderError,
} from './ai-provider';

interface GeminiProviderOptions {
  apiKeys: string[];
  model: string;
  baseUrl: string;
  timeoutMs: number;
  defaultMaxOutputTokens: number;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

class GeminiHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly retryable: boolean,
  ) {
    super(`Gemini request failed with status ${status}`);
  }
}

export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';
  readonly model: string;

  private readonly apiKeys: string[];
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly defaultMaxOutputTokens: number;
  private nextKeyIndex = 0;

  constructor(options: GeminiProviderOptions) {
    this.apiKeys = options.apiKeys;
    this.model = options.model;
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs;
    this.defaultMaxOutputTokens = options.defaultMaxOutputTokens;
  }

  async generateStructured(request: AIGenerateRequest): Promise<AIGenerateResponse> {
    if (this.apiKeys.length === 0) {
      throw new AIProviderError(
        'NOT_CONFIGURED',
        'The AI provider has not been configured',
      );
    }

    const startIndex = this.nextKeyIndex % this.apiKeys.length;
    this.nextKeyIndex = (this.nextKeyIndex + 1) % this.apiKeys.length;
    let lastError: unknown;

    for (let offset = 0; offset < this.apiKeys.length; offset += 1) {
      const keyIndex = (startIndex + offset) % this.apiKeys.length;
      try {
        return await this.requestWithKey(this.apiKeys[keyIndex], request);
      } catch (error) {
        lastError = error;
        if (error instanceof AIProviderError && error.reason === 'INVALID_RESPONSE') {
          throw error;
        }
        if (error instanceof GeminiHttpError && !error.retryable) {
          break;
        }
      }
    }

    if (lastError instanceof AIProviderError) {
      throw lastError;
    }
    throw new AIProviderError(
      'UNAVAILABLE',
      'The AI provider is temporarily unavailable',
    );
  }

  private async requestWithKey(
    apiKey: string,
    request: AIGenerateRequest,
  ): Promise<AIGenerateResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(
        `${this.baseUrl}/models/${encodeURIComponent(this.model)}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: request.systemInstruction }],
            },
            contents: [{ role: 'user', parts: request.parts }],
            generationConfig: {
              temperature: request.temperature ?? 0.2,
              maxOutputTokens:
                request.maxOutputTokens ?? this.defaultMaxOutputTokens,
              responseMimeType: 'application/json',
              responseJsonSchema: request.responseJsonSchema,
            },
          }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Gemini API error [${response.status}]:`, errorText);
        const retryable = response.status === 401
          || response.status === 403
          || response.status === 408
          || response.status === 429
          || response.status >= 500;
        throw new GeminiHttpError(response.status, retryable);
      }

      const payload = await response.json() as GeminiResponse;
      const text = payload.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? '')
        .join('')
        .trim();
      if (!text) {
        throw new AIProviderError(
          'INVALID_RESPONSE',
          'The AI provider returned an empty response',
        );
      }

      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        throw new AIProviderError(
          'INVALID_RESPONSE',
          'The AI provider returned malformed structured data',
        );
      }

      return {
        data,
        provider: this.name,
        model: this.model,
        usage: {
          promptTokens: payload.usageMetadata?.promptTokenCount ?? null,
          completionTokens: payload.usageMetadata?.candidatesTokenCount ?? null,
          totalTokens: payload.usageMetadata?.totalTokenCount ?? null,
        },
      };
    } catch (error) {
      if (error instanceof AIProviderError || error instanceof GeminiHttpError) {
        throw error;
      }
      throw new AIProviderError(
        'UNAVAILABLE',
        'The AI provider request timed out or could not be completed',
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
