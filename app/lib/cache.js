// Tiny per-instance in-memory TTL cache.
// Stores the PROMISE so concurrent misses share one loader call.
// A rejected loader removes its entry so the next call retries.

const store = globalThis.__quizCache || (globalThis.__quizCache = new Map());

const SWEEP_INTERVAL_MS = 60 * 1000;
let lastSweep = 0;

function sweep(now) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) {
    return;
  }

  lastSweep = now;
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) {
      store.delete(key);
    }
  }
}

export function cached(key, ttlMs, loader) {
  const now = Date.now();
  sweep(now);

  const existing = store.get(key);
  if (existing && existing.expiresAt > now) {
    return existing.promise;
  }

  const entry = { expiresAt: now + ttlMs, promise: null };
  entry.promise = Promise.resolve()
    .then(loader)
    .catch((error) => {
      if (store.get(key) === entry) {
        store.delete(key);
      }
      throw error;
    });

  store.set(key, entry);
  return entry.promise;
}

export function invalidate(key) {
  store.delete(key);
}

export function invalidatePrefix(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
    }
  }
}
