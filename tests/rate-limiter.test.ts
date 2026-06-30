import { describe, it, expect, vi, afterEach } from "vitest";
import { TokenBucketRateLimiter } from "../src/rate-limiter";

afterEach(() => vi.useRealTimers());

describe("TokenBucketRateLimiter", () => {
  it("acquires immediately when tokens and slots are available", async () => {
    const rl = new TokenBucketRateLimiter(10, 5);
    await expect(rl.acquire()).resolves.toBeUndefined();
  });

  it("enforces the concurrency cap", async () => {
    const rl = new TokenBucketRateLimiter(100, 2); // tokens plentiful, 2 slots
    await rl.acquire();
    await rl.acquire();

    let third = false;
    const p = rl.acquire().then(() => {
      third = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(third).toBe(false); // blocked on concurrency

    rl.release();
    await p;
    expect(third).toBe(true);
  });

  it("blocks when tokens are exhausted and resumes after refill", async () => {
    vi.useFakeTimers();
    const rl = new TokenBucketRateLimiter(2, 100); // 2 tokens/sec, slots plentiful
    await rl.acquire();
    await rl.acquire();

    let third = false;
    const p = rl.acquire().then(() => {
      third = true;
    });
    await Promise.resolve();
    expect(third).toBe(false); // out of tokens

    await vi.advanceTimersByTimeAsync(600); // ~0.5s refills one token
    await p;
    expect(third).toBe(true);
  });

  it("resumes queued acquirers in FIFO order", async () => {
    const rl = new TokenBucketRateLimiter(100, 1);
    await rl.acquire();

    const order: number[] = [];
    const p1 = rl.acquire().then(() => order.push(1));
    const p2 = rl.acquire().then(() => order.push(2));

    rl.release();
    await p1;
    rl.release();
    await p2;

    expect(order).toEqual([1, 2]);
  });

  it("never lets the active count fall below zero", async () => {
    const rl = new TokenBucketRateLimiter(10, 5);
    rl.release();
    rl.release();
    await expect(rl.acquire()).resolves.toBeUndefined();
  });
});
