import { logger } from '../utils/logger.js';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly provider: 'anthropic' | 'openai',
    public readonly statusCode?: number,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class RateLimitError extends ApiError {
  constructor(
    provider: 'anthropic' | 'openai',
    public readonly retryAfterMs: number = 1000,
  ) {
    super('Rate limit exceeded', provider, 429, true);
    this.name = 'RateLimitError';
  }
}

export class AuthenticationError extends ApiError {
  constructor(provider: 'anthropic' | 'openai') {
    super('Invalid API key', provider, 401, false);
    this.name = 'AuthenticationError';
  }
}

export function classifyError(error: unknown, provider: 'anthropic' | 'openai'): ApiError {
  if (error instanceof ApiError) return error;

  const err = error as { status?: number; statusCode?: number; message?: string };
  const status = err.status ?? err.statusCode;
  const message = err.message ?? String(error);

  if (status === 401) {
    return new AuthenticationError(provider);
  }
  if (status === 403) {
    return new ApiError(
      `Access denied (${provider}): ${message}`,
      provider, 403, false,
    );
  }
  if (status === 404) {
    return new ApiError(
      `Model not found (${provider}): ${message}`,
      provider, 404, false,
    );
  }
  if (status === 429) {
    return new RateLimitError(provider);
  }
  if (status && status >= 500) {
    return new ApiError(message, provider, status, true);
  }

  return new ApiError(message, provider, status, false);
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; provider: 'anthropic' | 'openai' } = { provider: 'anthropic' },
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  let lastError: ApiError | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = classifyError(error, options.provider);

      if (!lastError.retryable || attempt === maxRetries) {
        throw lastError;
      }

      const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
      logger.warn(
        `${lastError.provider} API error (attempt ${attempt + 1}/${maxRetries}): ${lastError.message}. Retrying in ${delay}ms...`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}
