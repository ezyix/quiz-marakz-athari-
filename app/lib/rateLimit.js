// Best-effort, per-instance fixed-window rate limiter (no external store).
// Each serverless instance counts separately, so treat it as a first line of
// defence and configure Vercel Firewall rate limits for global enforcement.

const buckets = globalThis.__quizRateLimit || (globalThis.__quizRateLimit = new Map());

const SWEEP_INTERVAL_MS = 60 * 1000;
let lastSweep = 0;

function sweep(now) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) {
    return;
  }

  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

export function getClientIp(request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const firstForwarded = forwardedFor?.split(",")[0]?.trim();

  return firstForwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

// Read a positive integer limit from env, falling back to a default.
export function limitFromEnv(name, fallback) {
  const value = Number.parseInt(process.env[name], 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function isDisabled() {
  // Allowed only outside production (e.g. Preview deployments for load tests).
  return process.env.RATE_LIMIT_DISABLED === "1" &&
    process.env.VERCEL_ENV !== "production";
}

export function rateLimit(request, { name, limit, windowMs = 60 * 1000 }) {
  if (isDisabled()) {
    return { ok: true, retryAfter: 0 };
  }

  const now = Date.now();
  sweep(now);

  const key = `${name}:${getClientIp(request)}`;
  let bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }

  bucket.count += 1;

  if (bucket.count > limit) {
    return {
      ok: false,
      retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  return { ok: true, retryAfter: 0 };
}
