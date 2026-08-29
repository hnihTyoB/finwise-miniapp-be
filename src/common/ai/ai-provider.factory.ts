import { envConfig } from '../../config/env.config';
import { AIProvider, AIProviderError } from './ai-provider';
import { GeminiProvider } from './gemini.provider';

let provider: AIProvider | undefined;

export function getAIProvider(): AIProvider {
  if (provider) {
    return provider;
  }

  if (envConfig.ai.provider !== 'gemini') {
    throw new AIProviderError(
      'NOT_CONFIGURED',
      `Unsupported AI provider: ${envConfig.ai.provider}`,
    );
  }

  provider = new GeminiProvider({
    apiKeys: envConfig.ai.geminiApiKeys,
    model: envConfig.ai.geminiModel,
    baseUrl: envConfig.ai.geminiBaseUrl,
    timeoutMs: envConfig.ai.requestTimeoutMs,
    defaultMaxOutputTokens: envConfig.ai.maxOutputTokens,
  });
  return provider;
}
