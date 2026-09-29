import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export type ApiLimitName = "assistant" | "transcribe";

type LocalBucket = { count: number; resetAt: number };
type LimitResult =
  | { allowed: true }
  | { allowed: false; kind: "limited"; retryAfter: number }
  | { allowed: false; kind: "unavailable" };

const policies: Record<ApiLimitName, { requests: number; windowMs: number }> = {
  assistant: { requests: 10, windowMs: 60_000 },
  transcribe: { requests: 10, windowMs: 60_000 },
};

const localBuckets = new Map<string, LocalBucket>();
const distributedLimiters = new Map<ApiLimitName, Ratelimit>();
let redis: Redis | undefined;

function getClientIp(request: Request): string | null {
  // Vercel overwrites these headers with the caller IP. Other hosts must
  // provide a trusted proxy header rather than forwarding client input.
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  return forwarded || realIp || null;
}

function getDistributedLimiter(name: ApiLimitName): Ratelimit | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const cached = distributedLimiters.get(name);
  if (cached) return cached;

  redis ??= new Redis({ url, token });
  const policy = policies[name];
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(policy.requests, "1 m"),
    prefix: `anthea:${name}`,
    analytics: false,
    // Upstash's timeout result is fail-open by default. We detect that result
    // below and fail closed before making any paid provider request.
    timeout: 1_000,
  });
  distributedLimiters.set(name, limiter);
  return limiter;
}

function applyLocalLimit(name: ApiLimitName, ip: string): LimitResult {
  const now = Date.now();
  if (localBuckets.size > 5_000) {
    for (const [key, bucket] of localBuckets) {
      if (bucket.resetAt <= now) localBuckets.delete(key);
    }
    while (localBuckets.size > 10_000) {
      const oldest = localBuckets.keys().next().value;
      if (oldest === undefined) break;
      localBuckets.delete(oldest);
    }
  }

  const key = `${name}:${ip}`;
  const policy = policies[name];
  const current = localBuckets.get(key);
  const bucket = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + policy.windowMs }
    : current;

  if (bucket.count >= policy.requests) {
    return {
      allowed: false,
      kind: "limited",
      retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1_000)),
    };
  }

  bucket.count += 1;
  localBuckets.set(key, bucket);
  return { allowed: true };
}

export async function enforceApiLimit(
  request: Request,
  name: ApiLimitName,
): Promise<LimitResult> {
  const ip = getClientIp(request);
  if (!ip) {
    // Do not treat an untrusted forwarded header as an IP. A shared fallback
    // is safe locally; production must be behind a proxy that supplies client IP.
    if (process.env.NODE_ENV === "production") {
      return { allowed: false, kind: "unavailable" };
    }
    return applyLocalLimit(name, "local");
  }

  try {
    const limiter = getDistributedLimiter(name);
    if (!limiter) {
      if (process.env.NODE_ENV === "production") {
        return { allowed: false, kind: "unavailable" };
      }
      return applyLocalLimit(name, ip);
    }

    const result = await limiter.limit(ip);
    if (result.reason === "timeout") {
      return { allowed: false, kind: "unavailable" };
    }
    if (!result.success) {
      return {
        allowed: false,
        kind: "limited",
        retryAfter: Math.max(1, Math.ceil((result.reset - Date.now()) / 1_000)),
      };
    }
    return { allowed: true };
  } catch (error) {
    console.error(`[rate-limit:${name}]`, error);
    return { allowed: false, kind: "unavailable" };
  }
}

export function rateLimitResponse(result: Exclude<LimitResult, { allowed: true }>) {
  if (result.kind === "limited") {
    return Response.json(
      { error: "Too many requests. Please try again shortly." },
      {
        status: 429,
        headers: { "Retry-After": String(result.retryAfter) },
      },
    );
  }

  return Response.json(
    { error: "This service is temporarily unavailable." },
    { status: 503, headers: { "Retry-After": "30" } },
  );
}

/** Read a request body without ever buffering more than the configured cap. */
export async function readBodyWithLimit(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array | null> {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}
