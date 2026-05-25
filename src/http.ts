export async function politeFetch(
  url: string,
  options: RequestInit = {},
  timeoutSec = 10,
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutSec * 1000);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
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
  return response.json();
}

export async function fetchXML(
  url: string,
  options: RequestInit = {},
  timeoutSec = 10,
): Promise<Document | null> {
  const response = await politeFetch(url, options, timeoutSec);
  if (!response.ok) return null;

  const text = await response.text();
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
  return response.text();
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
