// Helper function for delays
export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Exponential backoff helper function
export const withExponentialBackoff = async <T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  initialDelay = 1000,
  maxDelay = 10000,
): Promise<T> => {
  let retries = 0;
  let delayMs = initialDelay;

  while (true) {
    try {
      return await operation();
    } catch (error: any) {
      if (retries >= maxRetries) {
        throw error;
      }

      // Check if error is rate limit related
      const isRateLimit =
        error?.code === 429 ||
        error?.errors?.[0]?.reason === 'rateLimitExceeded' ||
        error?.errors?.[0]?.reason === 'userRateLimitExceeded';

      if (!isRateLimit) {
        throw error;
      }

      console.log(
        `Rate limit hit, retrying in ${delayMs}ms (attempt ${retries + 1}/${maxRetries})`,
      );
      await delay(delayMs);

      // Exponential backoff with jitter
      delayMs = Math.min(delayMs * 2 + Math.random() * 1000, maxDelay);
      retries++;
    }
  }
};
