import http from "node:http";
import https from "node:https";
import type { IncomingMessage } from "node:http";

const DEFAULT_TELEGRAM_API_BASE = "https://api.telegram.org";

export function telegramApiBase(): string {
  return (process.env.TELEGRAM_API_BASE_URL ?? DEFAULT_TELEGRAM_API_BASE).replace(/\/$/, "");
}

export function telegramBotMethodUrl(token: string, method: string): string {
  return `${telegramApiBase()}/bot${token}/${method}`;
}

export function telegramFileUrl(token: string, filePath: string): string {
  const path = normalizeTelegramFilePath(filePath)
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  return `${telegramApiBase()}/file/bot${token}/${path}`;
}

/** Local Bot API --local returns absolute disk paths; HTTP still uses a relative file_path. */
export function normalizeTelegramFilePath(filePath: string): string {
  let path = filePath.replace(/\\/g, "/").replace(/^\//, "");
  const localIdx = path.indexOf("telegram-bot-api/");
  if (localIdx >= 0) {
    const afterRoot = path.slice(localIdx + "telegram-bot-api/".length);
    const slash = afterRoot.indexOf("/");
    if (slash >= 0) path = afterRoot.slice(slash + 1);
  }
  return path.replace(/^\//, "");
}

export function isBlockedWebhookBase(base: string): boolean {
  const trimmed = base.trim();
  if (!trimmed) return true;
  if (/example\.invalid/i.test(trimmed)) return true;
  if (/localhost|127\.0\.0\.1/i.test(trimmed)) return true;
  if (/api\.telegram\.org/i.test(trimmed)) return true;
  return false;
}

export function isTelegramCloudHost(hostname: string): boolean {
  return hostname === "api.telegram.org" || hostname.endsWith(".telegram.org");
}

/** Pin cloud Telegram to a working IPv4 (Syria and similar networks). Local Bot API is never pinned. */
export function pinnedTelegramIp(hostname: string): string | undefined {
  const ip = (process.env.TELEGRAM_API_IP ?? "").trim();
  if (!ip || !isTelegramCloudHost(hostname)) return undefined;
  return ip;
}

const REQUEST_TIMEOUT_MS = Number(process.env.TELEGRAM_REQUEST_TIMEOUT_MS ?? 60000);
const FILE_TIMEOUT_MS = Number(process.env.TELEGRAM_FILE_TIMEOUT_MS ?? 60000);
const MAX_ATTEMPTS = 3;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nodeGet(
  urlStr: string,
  timeoutMs: number,
  redirects = 0,
): Promise<{ status: number; body: Buffer; headers: http.IncomingHttpHeaders }> {
  if (redirects > 5) {
    return Promise.reject(new Error("TELEGRAM_UNREACHABLE: too many redirects"));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    try {
      const u = new URL(urlStr);
      const lib = u.protocol === "https:" ? https : http;
      const pin = pinnedTelegramIp(u.hostname);
      const req = lib.request(
        {
          protocol: u.protocol,
          hostname: pin || u.hostname,
          servername: u.hostname,
          port: u.port || (u.protocol === "https:" ? 443 : 80),
          path: `${u.pathname}${u.search}`,
          method: "GET",
          family: 4,
          timeout: timeoutMs,
          headers: {
            Host: u.host,
            Accept: "*/*",
            Connection: "close",
          },
        },
        (res: IncomingMessage) => {
          const location = res.headers.location;
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && location) {
            res.resume();
            const next = new URL(location, u).toString();
            resolve(nodeGet(next, timeoutMs, redirects + 1));
            return;
          }
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer | string) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          });
          res.on("end", () => {
            if (settled) return;
            settled = true;
            resolve({
              status: res.statusCode ?? 0,
              body: Buffer.concat(chunks),
              headers: res.headers,
            });
          });
          res.on("error", fail);
        },
      );
      req.on("timeout", () => {
        req.destroy();
        fail(new Error(`TELEGRAM_UNREACHABLE: file download timeout after ${timeoutMs}ms`));
      });
      req.on("error", fail);
      req.end();
    } catch (err) {
      fail(err);
    }
  });
}

export async function telegramFetch(
  url: string,
  init?: RequestInit,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  let lastError: unknown = null;
  const attempts = timeoutMs <= FILE_TIMEOUT_MS ? 2 : MAX_ATTEMPTS;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetch(url, {
        ...init,
        cache: "no-store",
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      lastError = err;
      if (attempt < attempts) {
        await sleep(400 * attempt);
      }
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`TELEGRAM_UNREACHABLE: ${detail}`);
}

export async function telegramFetchFile(url: string): Promise<Response> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const got = await nodeGet(url, FILE_TIMEOUT_MS);
      const headers = new Headers();
      for (const [key, value] of Object.entries(got.headers)) {
        if (typeof value === "string") headers.set(key, value);
        else if (Array.isArray(value)) headers.set(key, value.join(", "));
      }
      return new Response(new Uint8Array(got.body), { status: got.status, headers });
    } catch (err) {
      lastError = err;
      if (attempt < MAX_ATTEMPTS) {
        await sleep(500 * attempt);
      }
    }
  }
  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`TELEGRAM_UNREACHABLE: ${detail}`);
}

export async function telegramBotCall<T = unknown>(
  token: string,
  method: string,
  init?: RequestInit,
): Promise<T> {
  const res = await telegramFetch(telegramBotMethodUrl(token, method), init);
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`TELEGRAM_BAD_RESPONSE: HTTP ${res.status}`);
  }
}
