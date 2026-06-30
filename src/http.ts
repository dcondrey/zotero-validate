export interface HttpIdentity {
  appName: string;
  version: string;
  mailto?: string;
}

let identity: HttpIdentity = {
  appName: "ReferenceValidator",
  version: "0.1.0",
};

export function setHttpIdentity(next: Partial<HttpIdentity>): void {
  identity = { ...identity, ...next };
}

function userAgent(): string {
  const base = `${identity.appName}/${identity.version}`;
  return identity.mailto
    ? `${base} (mailto:${identity.mailto})`
    : `${base} (+https://github.com/dcondrey/zotero-validate)`;
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;
const MAX_BACKOFF_MS = 30000;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

function isIdempotent(method?: string): boolean {
  const m = (method || "GET").toUpperCase();
  return m === "GET" || m === "HEAD";
}

function isTransientNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "AbortError") return false; // our own timeout: do not retry
  const msg = error.message.toLowerCase();
  return (
    msg.includes("network") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("socket") ||
    msg.includes("failed to fetch")
  );
}

function backoffDelayMs(attempt: number, retryAfter: string | null): number {
  if (retryAfter) {
    const secs = Number(retryAfter);
    if (Number.isFinite(secs) && secs >= 0) {
      return Math.min(secs * 1000, MAX_BACKOFF_MS);
    }
    const when = Date.parse(retryAfter);
    if (!Number.isNaN(when)) {
      return Math.min(Math.max(0, when - Date.now()), MAX_BACKOFF_MS);
    }
  }
  return Math.min(500 * 2 ** attempt, MAX_BACKOFF_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readBoundedText(response: Response): Promise<string> {
  const declared = response.headers.get("content-length");
  if (declared) {
    const n = Number(declared);
    if (Number.isFinite(n) && n > MAX_RESPONSE_BYTES) {
      throw new Error(`Response too large: ${n} bytes`);
    }
  }
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) {
    throw new Error(`Response too large: ${text.length} bytes`);
  }
  return text;
}

export async function politeFetch(
  url: string,
  options: RequestInit = {},
  timeoutSec = 10,
): Promise<Response> {
  const headers = new Headers(options.headers || {});
  if (!headers.has("User-Agent")) headers.set("User-Agent", userAgent());
  const retryable = isIdempotent(options.method);

  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutSec * 1000);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });
      clearTimeout(id);
      if (
        retryable &&
        RETRYABLE_STATUS.has(response.status) &&
        attempt < MAX_RETRIES
      ) {
        await sleep(
          backoffDelayMs(attempt, response.headers.get("retry-after")),
        );
        continue;
      }
      return response;
    } catch (error) {
      clearTimeout(id);
      lastError = error;
      if (
        retryable &&
        isTransientNetworkError(error) &&
        attempt < MAX_RETRIES
      ) {
        await sleep(backoffDelayMs(attempt, null));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

export async function fetchJSON(
  url: string,
  options: RequestInit = {},
  timeoutSec = 10,
): Promise<any> {
  const response = await politeFetch(url, options, timeoutSec);
  if (!response.ok) return null;

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("json") && !contentType.includes("javascript")) {
    throw new Error(`Expected JSON but got ${contentType}`);
  }
  return JSON.parse(await readBoundedText(response));
}

export async function fetchXML(
  url: string,
  options: RequestInit = {},
  timeoutSec = 10,
): Promise<Document | null> {
  const response = await politeFetch(url, options, timeoutSec);
  if (!response.ok) return null;

  const text = await readBoundedText(response);
  if (text.trimStart().startsWith("<")) {
    const parser = new DOMParser();
    return parser.parseFromString(text, "text/xml");
  }
  throw new Error("Response is not XML");
}

export async function fetchText(
  url: string,
  options: RequestInit = {},
  timeoutSec = 10,
): Promise<string | null> {
  const response = await politeFetch(url, options, timeoutSec);
  if (!response.ok) return null;
  return readBoundedText(response);
}

export function safeGet(obj: any, ...path: string[]): any {
  let current = obj;
  for (const key of path) {
    if (current == null || typeof current !== "object") return undefined;
    current = current[key];
  }
  return current;
}

export function safeString(val: any, fallback = ""): string {
  if (typeof val === "string") return val;
  if (val == null) return fallback;
  return String(val);
}

export function safeNumber(val: any): number | undefined {
  if (typeof val === "number" && !isNaN(val)) return val;
  if (typeof val === "string") {
    const n = parseInt(val, 10);
    return isNaN(n) ? undefined : n;
  }
  return undefined;
}

export function safeArray(val: any): any[] {
  if (Array.isArray(val)) return val;
  if (val == null) return [];
  return [val];
}
