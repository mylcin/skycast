import {
  CancelledError,
  InvalidResponseError,
  NetworkError,
  RateLimitError,
  TimeoutError,
  UpstreamError,
} from '../core/errors.ts';
import type { Freshness } from '../core/models.ts';
import { cacheKey, type Cache } from './cache.ts';

export interface CachePolicy {
  /** Entries younger than this are used without a request. */
  readonly ttlMs: number;
  /** If the network fails, entries younger than this are used anyway. */
  readonly staleMs: number;
}

export interface GetJsonOptions<T> {
  /** Validates the body. Throwing marks the response as invalid. */
  readonly parse: (body: unknown) => T;
  readonly cache?: CachePolicy;
  readonly signal?: AbortSignal;
}

export interface JsonResponse<T> {
  readonly data: T;
  readonly freshness: Freshness;
}

export interface HttpClient {
  getJson<T>(url: URL, options: GetJsonOptions<T>): Promise<JsonResponse<T>>;
}

export interface HttpClientOptions {
  readonly userAgent: string;
  readonly cache?: Cache | null;
  /** Per attempt. */
  readonly timeoutMs?: number;
  readonly retries?: number;
  readonly baseDelayMs?: number;
  /** A longer Retry-After fails fast instead of making the user wait. */
  readonly maxRetryAfterMs?: number;
  /** Defaults to the global fetch, looked up per call so mocks apply. */
  readonly fetch?: typeof fetch;
  readonly now?: () => Date;
  readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  readonly random?: () => number;
  readonly timeoutSignal?: (ms: number) => AbortSignal;
  readonly log?: (message: string) => void;
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export function abortableSleep(
  ms: number,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new CancelledError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new CancelledError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Seconds or an HTTP date, in milliseconds from `now`. */
export function parseRetryAfter(
  value: string | null,
  now: Date
): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - now.getTime());
}

/** Open-Meteo errors look like {"error":true,"reason":"..."}. */
function errorReason(text: string): string | null {
  try {
    const body: unknown = JSON.parse(text);
    if (typeof body === 'object' && body !== null && 'reason' in body) {
      return typeof body.reason === 'string' ? body.reason : null;
    }
  } catch {
    // Not JSON (a proxy's HTML page, for example).
  }
  return null;
}

/** Failures where old data beats no data: offline, server down, throttled. */
function isOutage(error: unknown): boolean {
  if (error instanceof NetworkError) return true;
  return (
    error instanceof UpstreamError &&
    !(error instanceof InvalidResponseError) &&
    (error.status >= 500 || error.status === 429)
  );
}

class RetryableError extends Error {
  readonly error: Error;
  readonly retryAfterMs: number | null;

  constructor(error: Error, retryAfterMs: number | null = null) {
    super(error.message);
    this.error = error;
    this.retryAfterMs = retryAfterMs;
  }
}

export function createHttpClient(options: HttpClientOptions): HttpClient {
  const {
    userAgent,
    cache = null,
    timeoutMs = 8000,
    retries = 2,
    baseDelayMs = 300,
    maxRetryAfterMs = 5000,
    now = () => new Date(),
    sleep = abortableSleep,
    random = Math.random,
    timeoutSignal = (ms: number) => AbortSignal.timeout(ms),
    log = () => undefined,
  } = options;

  async function attempt(url: URL, signal?: AbortSignal): Promise<unknown> {
    const timeout = timeoutSignal(timeoutMs);
    const started = Date.now();
    // Built outside the try: a request that can't even be constructed (bad
    // header, credentials in the URL) is a bug, not a network outage.
    const request = new Request(url, {
      headers: { accept: 'application/json', 'user-agent': userAgent },
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    let response: Response;
    let text: string;
    try {
      const fetchImpl = options.fetch ?? globalThis.fetch;
      response = await fetchImpl(request);
      // The body streams under the same signal, so it can time out, be
      // reset or be cancelled too.
      text = await response.text();
    } catch (error) {
      if (signal?.aborted) throw new CancelledError();
      if (timeout.aborted) {
        throw new RetryableError(new TimeoutError(url.host, timeoutMs));
      }
      if (error instanceof TypeError) {
        throw new RetryableError(new NetworkError(url.host, { cause: error }));
      }
      throw error;
    }

    log(`GET ${url.href} → ${response.status} (${Date.now() - started} ms)`);
    if (response.ok) {
      try {
        return JSON.parse(text) as unknown;
      } catch {
        throw new InvalidResponseError(url.host, 'body is not JSON');
      }
    }

    const reason = errorReason(text);
    const error =
      response.status === 429
        ? new RateLimitError(url.host, response.status, reason)
        : new UpstreamError(url.host, response.status, reason);
    if (!RETRYABLE_STATUS.has(response.status)) throw error;
    const retryAfter = parseRetryAfter(
      response.headers.get('retry-after'),
      now()
    );
    if (retryAfter !== null && retryAfter > maxRetryAfterMs) throw error;
    throw new RetryableError(error, retryAfter);
  }

  async function fetchJson(url: URL, signal?: AbortSignal): Promise<unknown> {
    for (let n = 0; ; n++) {
      try {
        return await attempt(url, signal);
      } catch (caught) {
        if (!(caught instanceof RetryableError)) throw caught;
        if (n >= retries) throw caught.error;
        // Full jitter: spreads retries from many clients over the window.
        const delay =
          caught.retryAfterMs ?? Math.round(random() * baseDelayMs * 2 ** n);
        log(`retrying in ${delay} ms: ${caught.error.message}`);
        await sleep(delay, signal);
      }
    }
  }

  function validate<T>(
    url: URL,
    parse: (body: unknown) => T,
    body: unknown
  ): T {
    try {
      return parse(body);
    } catch (error) {
      throw new InvalidResponseError(
        url.host,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  return {
    async getJson<T>(
      url: URL,
      { parse, cache: policy, signal }: GetJsonOptions<T>
    ) {
      const key = policy && cache ? cacheKey(url) : null;
      const entry =
        key && cache ? await cache.get(key).catch(() => null) : null;
      let cached: { data: T; storedAt: number } | null = null;
      if (entry) {
        try {
          cached = { data: parse(entry.data), storedAt: entry.storedAt };
        } catch {
          log(`ignoring a cache entry that no longer validates: ${url.href}`);
        }
      }

      // An entry from the future (the clock was wrong when it was written)
      // counts as expired rather than fresh forever.
      const age =
        cached && Number.isFinite(cached.storedAt)
          ? now().getTime() - cached.storedAt
          : Infinity;
      const usable = age >= 0;
      if (cached && policy && usable && age < policy.ttlMs) {
        log(`cache hit (${Math.round(age / 1000)} s old): ${url.href}`);
        const fetchedAt = new Date(cached.storedAt);
        return {
          data: cached.data,
          freshness: { fetchedAt, cached: true, stale: false },
        };
      }

      try {
        const body = await fetchJson(url, signal);
        const data = validate(url, parse, body);
        const fetchedAt = now();
        if (key && cache) {
          await cache
            .set(key, { storedAt: fetchedAt.getTime(), data: body })
            .catch((error: unknown) => {
              log(`could not write the cache: ${String(error)}`);
            });
        }
        return { data, freshness: { fetchedAt, cached: false, stale: false } };
      } catch (error) {
        if (
          cached &&
          policy &&
          usable &&
          isOutage(error) &&
          age < policy.staleMs
        ) {
          log(
            `request failed, using a ${Math.round(age / 60_000)} min old cache entry`
          );
          const fetchedAt = new Date(cached.storedAt);
          const staleBecause =
            error instanceof NetworkError ? 'offline' : 'unavailable';
          return {
            data: cached.data,
            freshness: { fetchedAt, cached: true, stale: true, staleBecause },
          };
        }
        throw error;
      }
    },
  };
}
