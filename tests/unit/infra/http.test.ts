import { delay, http as mock, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import {
  CancelledError,
  InvalidResponseError,
  NetworkError,
  RateLimitError,
  TimeoutError,
  UpstreamError,
} from '../../../src/core/errors.ts';
import { cacheKey, createMemoryCache } from '../../../src/infra/cache.ts';
import {
  abortableSleep,
  createHttpClient,
  parseRetryAfter,
  type HttpClientOptions,
} from '../../../src/infra/http.ts';
import { server } from '../../helpers/msw.ts';

const URL_ = new URL('https://api.test/v1/data?b=2&a=1');
const parse = (body: unknown) => body as { value: number };
const policy = { ttlMs: 60_000, staleMs: 3_600_000 };

function client(overrides: Partial<HttpClientOptions> = {}) {
  const sleep = vi.fn<(ms: number) => Promise<void>>(() => Promise.resolve());
  let now = new Date('2026-09-27T12:00:00Z');
  const instance = createHttpClient({
    userAgent: 'skycast-test',
    sleep,
    random: () => 0.5,
    now: () => now,
    ...overrides,
  });
  return {
    instance,
    sleep,
    advance: (ms: number) => (now = new Date(now.getTime() + ms)),
  };
}

describe('getJson', () => {
  it('returns parsed JSON and sends a user agent', async () => {
    let agent: string | null = null;
    server.use(
      mock.get('https://api.test/v1/data', ({ request }) => {
        agent = request.headers.get('user-agent');
        return HttpResponse.json({ value: 1 });
      })
    );
    const { data, freshness } = await client().instance.getJson(URL_, {
      parse,
    });
    expect(data).toEqual({ value: 1 });
    expect(freshness).toMatchObject({ cached: false, stale: false });
    expect(agent).toBe('skycast-test');
  });

  it('turns an API error body into an UpstreamError with its reason', async () => {
    server.use(
      mock.get('https://api.test/v1/data', () =>
        HttpResponse.json(
          { error: true, reason: 'Latitude must be in range' },
          { status: 400 }
        )
      )
    );
    const error = await client()
      .instance.getJson(URL_, { parse })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UpstreamError);
    expect(error).toMatchObject({
      status: 400,
      reason: 'Latitude must be in range',
    });
  });

  it('does not retry client errors', async () => {
    const calls = vi.fn();
    server.use(
      mock.get('https://api.test/v1/data', () => {
        calls();
        return new HttpResponse('<html>too long</html>', { status: 414 });
      })
    );
    const error = await client()
      .instance.getJson(URL_, { parse })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 414, reason: null });
    expect(calls).toHaveBeenCalledOnce();
  });

  it('retries server errors with jittered backoff, then succeeds', async () => {
    let calls = 0;
    server.use(
      mock.get('https://api.test/v1/data', () =>
        ++calls < 3
          ? new HttpResponse(null, { status: 503 })
          : HttpResponse.json({ value: 3 })
      )
    );
    const { instance, sleep } = client();
    const { data } = await instance.getJson(URL_, { parse });
    expect(data.value).toBe(3);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([150, 300]);
  });

  it('gives up after the retry budget', async () => {
    server.use(
      mock.get(
        'https://api.test/v1/data',
        () => new HttpResponse(null, { status: 502 })
      )
    );
    const { instance, sleep } = client({ retries: 1 });
    await expect(instance.getJson(URL_, { parse })).rejects.toMatchObject({
      status: 502,
    });
    expect(sleep).toHaveBeenCalledOnce();
  });

  it('honours a short Retry-After and fails fast on a long one', async () => {
    let calls = 0;
    server.use(
      mock.get('https://api.test/v1/data', () =>
        ++calls === 1
          ? new HttpResponse(null, {
              status: 429,
              headers: { 'retry-after': '2' },
            })
          : HttpResponse.json({ value: 1 })
      )
    );
    const first = client();
    await first.instance.getJson(URL_, { parse });
    expect(first.sleep).toHaveBeenCalledWith(2000, undefined);

    server.use(
      mock.get('https://api.test/v1/data', () =>
        HttpResponse.json(
          { error: true, reason: 'Daily API request limit exceeded' },
          { status: 429, headers: { 'retry-after': '3600' } }
        )
      )
    );
    const second = client();
    const error = await second.instance
      .getJson(URL_, { parse })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RateLimitError);
    expect(second.sleep).not.toHaveBeenCalled();
  });

  it('reports network failures as NetworkError after retrying', async () => {
    server.use(
      mock.get('https://api.test/v1/data', () => HttpResponse.error())
    );
    const { instance, sleep } = client();
    const error = await instance
      .getJson(URL_, { parse })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NetworkError);
    expect(error).toMatchObject({ host: 'api.test', code: 'NETWORK' });
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('times out a request that hangs', async () => {
    server.use(
      mock.get('https://api.test/v1/data', async () => {
        await delay('infinite');
        return HttpResponse.json({});
      })
    );
    const controller = new AbortController();
    const { instance } = client({
      retries: 0,
      timeoutMs: 1234,
      timeoutSignal: () => {
        setTimeout(() => {
          controller.abort(new DOMException('timed out', 'TimeoutError'));
        }, 1);
        return controller.signal;
      },
    });
    const error = await instance
      .getJson(URL_, { parse })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TimeoutError);
    expect(error).toMatchObject({ timeoutMs: 1234, code: 'TIMEOUT' });
  });

  it('stops when the caller aborts', async () => {
    server.use(
      mock.get('https://api.test/v1/data', async () => {
        await delay('infinite');
        return HttpResponse.json({});
      })
    );
    const controller = new AbortController();
    const pending = client().instance.getJson(URL_, {
      parse,
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(CancelledError);
  });

  it('rejects bodies that are not JSON or fail validation', async () => {
    server.use(
      mock.get('https://api.test/v1/data', () => new HttpResponse('nope'))
    );
    await expect(
      client().instance.getJson(URL_, { parse })
    ).rejects.toBeInstanceOf(InvalidResponseError);

    server.use(
      mock.get('https://api.test/v1/data', () =>
        HttpResponse.json({ value: 'x' })
      )
    );
    const strict = (body: unknown) => {
      if (typeof (body as { value: unknown }).value !== 'number')
        throw new Error('value: expected number');
      return body;
    };
    await expect(
      client().instance.getJson(URL_, { parse: strict })
    ).rejects.toThrow('value: expected number');
  });
});

describe('failures while reading the body', () => {
  /** A response whose body fails (or hangs until the request is aborted). */
  const response = (text: (signal: AbortSignal) => Promise<string>) =>
    ((request: Request) =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: () => text(request.signal),
      } as Response)) as unknown as typeof fetch;

  const hang = (signal: AbortSignal) =>
    new Promise<string>((_, reject) => {
      signal.addEventListener('abort', () => {
        reject(signal.reason as Error);
      });
    });

  it('retries a reset connection as a network error', async () => {
    const { instance, sleep } = client({
      fetch: response(() => Promise.reject(new TypeError('terminated'))),
    });
    const error = await instance
      .getJson(URL_, { parse })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NetworkError);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('reports a stalled body as a timeout', async () => {
    const { instance } = client({
      retries: 0,
      fetch: response(hang),
      timeoutSignal: () => AbortSignal.timeout(5),
    });
    await expect(instance.getJson(URL_, { parse })).rejects.toBeInstanceOf(
      TimeoutError
    );
  });

  it('cancels when the caller aborts mid-body', async () => {
    const controller = new AbortController();
    const { instance } = client({ fetch: response(hang) });
    const pending = instance.getJson(URL_, {
      parse,
      signal: controller.signal,
    });
    setTimeout(() => {
      controller.abort();
    }, 1);
    await expect(pending).rejects.toBeInstanceOf(CancelledError);
  });

  it('falls back to the cache when the body keeps failing', async () => {
    const cache = createMemoryCache();
    await cache.set(cacheKey(URL_), {
      storedAt: new Date('2026-09-27T11:30:00Z').getTime(),
      data: { value: 1 },
    });
    const { instance } = client({
      cache,
      fetch: response(() => Promise.reject(new TypeError('terminated'))),
    });
    const { freshness } = await instance.getJson(URL_, {
      parse,
      cache: policy,
    });
    expect(freshness.stale).toBe(true);
  });
});

describe('requests that cannot be built', () => {
  it('fail at once instead of looking like an outage', async () => {
    const { instance, sleep } = client();
    const error = await instance
      .getJson(new URL('https://user:secret@api.test/v1/data'), { parse })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TypeError);
    expect(error).not.toBeInstanceOf(NetworkError);
    expect(sleep).not.toHaveBeenCalled();
  });
});

describe('caching', () => {
  it('serves fresh entries without a request, whatever the parameter order', async () => {
    const calls = vi.fn();
    server.use(
      mock.get('https://api.test/v1/data', () => {
        calls();
        return HttpResponse.json({ value: 1 });
      })
    );
    const { instance, advance } = client({ cache: createMemoryCache() });
    await instance.getJson(URL_, { parse, cache: policy });
    advance(30_000);
    const again = await instance.getJson(
      new URL('https://api.test/v1/data?a=1&b=2'),
      {
        parse,
        cache: policy,
      }
    );
    expect(calls).toHaveBeenCalledOnce();
    expect(again.freshness).toMatchObject({ cached: true, stale: false });
    expect(again.freshness.fetchedAt.toISOString()).toBe(
      '2026-09-27T12:00:00.000Z'
    );
  });

  it('refetches expired entries', async () => {
    let value = 0;
    server.use(
      mock.get('https://api.test/v1/data', () =>
        HttpResponse.json({ value: ++value })
      )
    );
    const { instance, advance } = client({ cache: createMemoryCache() });
    await instance.getJson(URL_, { parse, cache: policy });
    advance(61_000);
    const { data } = await instance.getJson(URL_, { parse, cache: policy });
    expect(data.value).toBe(2);
  });

  it('falls back to a stale entry when offline, but not forever', async () => {
    server.use(
      mock.get('https://api.test/v1/data', () =>
        HttpResponse.json({ value: 1 })
      )
    );
    const { instance, advance } = client({ cache: createMemoryCache() });
    await instance.getJson(URL_, { parse, cache: policy });

    server.use(
      mock.get('https://api.test/v1/data', () => HttpResponse.error())
    );
    advance(10 * 60_000);
    const stale = await instance.getJson(URL_, { parse, cache: policy });
    expect(stale.freshness).toMatchObject({ cached: true, stale: true });

    advance(3_600_000);
    await expect(
      instance.getJson(URL_, { parse, cache: policy })
    ).rejects.toBeInstanceOf(NetworkError);
  });

  it('falls back when the API is down, not when the request is wrong', async () => {
    server.use(
      mock.get('https://api.test/v1/data', () =>
        HttpResponse.json({ value: 1 })
      )
    );
    const { instance, advance } = client({
      cache: createMemoryCache(),
      retries: 0,
    });
    await instance.getJson(URL_, { parse, cache: policy });
    advance(120_000);

    server.use(
      mock.get(
        'https://api.test/v1/data',
        () => new HttpResponse(null, { status: 500 })
      )
    );
    expect(
      (await instance.getJson(URL_, { parse, cache: policy })).freshness.stale
    ).toBe(true);

    server.use(
      mock.get('https://api.test/v1/data', () =>
        HttpResponse.json({ reason: 'bad' }, { status: 400 })
      )
    );
    await expect(
      instance.getJson(URL_, { parse, cache: policy })
    ).rejects.toMatchObject({
      status: 400,
    });
  });

  it('refetches when a cache entry no longer validates', async () => {
    const cache = createMemoryCache();
    const { instance } = client({ cache });
    let calls = 0;
    server.use(
      mock.get('https://api.test/v1/data', () =>
        HttpResponse.json({ value: ++calls })
      )
    );
    await instance.getJson(URL_, { parse, cache: policy });
    // A newer schema that the cached { value: 1 } does not satisfy.
    const onlyTwo = (body: unknown) => {
      if ((body as { value: number }).value !== 2) throw new Error('old shape');
      return body as { value: number };
    };
    const result = await instance.getJson(URL_, {
      parse: onlyTwo,
      cache: policy,
    });
    expect(calls).toBe(2);
    expect(result.data.value).toBe(2);
    expect(result.freshness.cached).toBe(false);
  });

  it('treats an entry from the future as expired', async () => {
    const cache = createMemoryCache();
    await cache.set(cacheKey(URL_), {
      storedAt: new Date('2026-09-28T12:00:00Z').getTime(),
      data: { value: 1 },
    });
    server.use(
      mock.get('https://api.test/v1/data', () =>
        HttpResponse.json({ value: 2 })
      )
    );
    const { data } = await client({ cache }).instance.getJson(URL_, {
      parse,
      cache: policy,
    });
    expect(data.value).toBe(2);
  });

  it('keeps working when the cache cannot be written', async () => {
    const log = vi.fn();
    server.use(
      mock.get('https://api.test/v1/data', () =>
        HttpResponse.json({ value: 1 })
      )
    );
    const { instance } = client({
      log,
      cache: {
        get: () => Promise.resolve(null),
        set: () => Promise.reject(new Error('disk full')),
        clear: () => Promise.resolve(0),
      },
    });
    const { data } = await instance.getJson(URL_, { parse, cache: policy });
    expect(data.value).toBe(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('disk full'));
  });
});

describe('helpers', () => {
  it('parses Retry-After seconds and dates', () => {
    const now = new Date('2026-09-27T12:00:00Z');
    expect(parseRetryAfter('3', now)).toBe(3000);
    expect(parseRetryAfter('Sun, 27 Sep 2026 12:00:10 GMT', now)).toBe(10_000);
    expect(parseRetryAfter('soon', now)).toBeNull();
    expect(parseRetryAfter(null, now)).toBeNull();
  });

  it('sleeps and can be interrupted', async () => {
    await expect(abortableSleep(1)).resolves.toBeUndefined();
    const controller = new AbortController();
    const pending = abortableSleep(10_000, controller.signal);
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(CancelledError);
    await expect(abortableSleep(1, controller.signal)).rejects.toBeInstanceOf(
      CancelledError
    );
  });
});
