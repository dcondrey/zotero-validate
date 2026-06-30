/**
 * Token-bucket rate limiter with a concurrency cap.
 *
 * Tokens refill continuously at `perSecond`; each `acquire()` consumes one
 * token and one concurrency slot, released by a matching `release()`. Callers
 * that cannot proceed immediately are queued and resumed in FIFO order once a
 * token and a slot are both available.
 */
export class TokenBucketRateLimiter {
  private queue: (() => void)[] = [];
  private activeConnections = 0;
  private tokens: number;
  private lastRefill: number = Date.now();
  private isProcessing = false;

  constructor(
    private perSecond: number,
    private maxConcurrent: number,
  ) {
    this.tokens = perSecond;
  }

  async acquire(): Promise<void> {
    this.refill();
    if (this.activeConnections < this.maxConcurrent && this.tokens >= 1) {
      this.tokens--;
      this.activeConnections++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
      this.scheduleProcess();
    });
  }

  release(): void {
    this.activeConnections = Math.max(0, this.activeConnections - 1);
    this.scheduleProcess();
  }

  private refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    if (elapsed > 0) {
      this.tokens = Math.min(
        this.perSecond,
        this.tokens + elapsed * this.perSecond,
      );
      this.lastRefill = now;
    }
  }

  private scheduleProcess() {
    if (this.isProcessing || this.queue.length === 0) return;

    this.refill();
    while (
      this.queue.length > 0 &&
      this.activeConnections < this.maxConcurrent &&
      this.tokens >= 1
    ) {
      this.tokens--;
      this.activeConnections++;
      const next = this.queue.shift();
      if (next) next();
    }

    if (this.queue.length > 0) {
      this.isProcessing = true;
      const tokensNeeded = 1 - this.tokens;
      const delay = Math.max(50, (tokensNeeded / this.perSecond) * 1000);
      setTimeout(() => {
        this.isProcessing = false;
        this.scheduleProcess();
      }, delay);
    }
  }
}
