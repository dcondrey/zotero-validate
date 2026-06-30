import { describe, it, expect, vi, afterEach } from "vitest";
import { politeFetch, fetchJSON, setHttpIdentity } from "../src/http";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

afterEach(() => {
  setHttpIdentity({ version: "0.1.0", mailto: undefined });
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("politeFetch identity", () => {
  it("sends a default User-Agent when none is provided", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({})));
    global.fetch = fetchMock as any;

    await politeFetch("https://example.test");

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const ua = new Headers(init.headers).get("User-Agent") || "";
    expect(ua).toContain("ReferenceValidator/0.1.0");
  });

  it("includes a mailto in the User-Agent once identity is set", async () => {
    setHttpIdentity({ version: "1.2.3", mailto: "dev@example.com" });
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({})));
    global.fetch = fetchMock as any;

    await politeFetch("https://example.test");

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const ua = new Headers(init.headers).get("User-Agent") || "";
    expect(ua).toBe("ReferenceValidator/1.2.3 (mailto:dev@example.com)");
  });

  it("does not override a caller-provided User-Agent", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({})));
    global.fetch = fetchMock as any;

    await politeFetch("https://example.test", {
      headers: { "User-Agent": "Custom/9" },
    });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers).get("User-Agent")).toBe("Custom/9");
  });
});

describe("politeFetch retry", () => {
  it("retries an idempotent request on 429 and returns the eventual 200", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(jsonResponse({ ok: 1 }));
    global.fetch = fetchMock as any;

    const p = politeFetch("https://example.test");
    await vi.runAllTimersAsync();
    const res = await p;

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("honors a Retry-After header for the backoff delay", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("", { status: 503, headers: { "retry-after": "2" } }),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: 1 }));
    global.fetch = fetchMock as any;

    const p = politeFetch("https://example.test");
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2);
    await p;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a non-idempotent (POST) request on 429", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response("", { status: 429 })),
    );
    global.fetch = fetchMock as any;

    const res = await politeFetch("https://example.test", { method: "POST" });

    expect(res.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry on a non-retryable status (404)", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response("", { status: 404 })),
    );
    global.fetch = fetchMock as any;

    const res = await politeFetch("https://example.test");

    expect(res.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a transient network error then succeeds", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET socket hang up"))
      .mockResolvedValueOnce(jsonResponse({ ok: 1 }));
    global.fetch = fetchMock as any;

    const p = politeFetch("https://example.test");
    await vi.runAllTimersAsync();
    const res = await p;

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry an AbortError (timeout)", async () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    const fetchMock = vi.fn(() => Promise.reject(err));
    global.fetch = fetchMock as any;

    await expect(politeFetch("https://example.test")).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up after the retry budget is exhausted", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response("", { status: 503 })),
    );
    global.fetch = fetchMock as any;

    const p = politeFetch("https://example.test");
    await vi.runAllTimersAsync();
    const res = await p;

    expect(res.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(4); // initial + 3 retries
  });
});

describe("fetchJSON bounds", () => {
  it("returns null on a non-ok response", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(new Response("", { status: 500 })),
    ) as any;
    // 500 is retryable; exhausts and returns the 500 -> fetchJSON yields null
    vi.useFakeTimers();
    const p = fetchJSON("https://example.test");
    await vi.runAllTimersAsync();
    expect(await p).toBeNull();
  });

  it("rejects an over-large response declared via content-length", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(
        new Response("{}", {
          status: 200,
          headers: {
            "content-type": "application/json",
            "content-length": String(64 * 1024 * 1024),
          },
        }),
      ),
    ) as any;

    await expect(fetchJSON("https://example.test")).rejects.toThrow(
      /too large/,
    );
  });

  it("parses a normal JSON body", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(jsonResponse({ hello: "world" })),
    ) as any;

    expect(await fetchJSON("https://example.test")).toEqual({ hello: "world" });
  });
});
