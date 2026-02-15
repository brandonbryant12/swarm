export interface RetryOptions {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs?: number;
}

export class RetryableError extends Error {
  readonly retryAfterMs: number | undefined;

  constructor(message: string, retryAfterMs?: number) {
    super(message);
    this.name = "RetryableError";
    this.retryAfterMs = retryAfterMs;
  }
}

export const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const jitter = (ms: number): number => {
  const spread = Math.floor(ms * 0.2);
  return ms + Math.floor((Math.random() * 2 - 1) * spread);
};

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const maxDelayMs = options.maxDelayMs ?? 30_000;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      const isRetryable = error instanceof RetryableError;
      const isFinalAttempt = attempt === options.maxAttempts;

      if (!isRetryable || isFinalAttempt) {
        throw error;
      }

      const backoff = Math.min(options.baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      const retryAfterMs =
        error.retryAfterMs && error.retryAfterMs > 0 ? error.retryAfterMs : jitter(backoff);
      await sleep(retryAfterMs);
    }
  }

  throw new Error("Retry exhausted");
}
