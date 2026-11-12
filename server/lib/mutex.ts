// Per-key async lock. The app runs as a single Node process,
// so this is enough to serialize read-modify-write of one user's data.
const tails = new Map<string, Promise<unknown>>();

export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = tails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => (release = resolve));
  const tail = prev.then(() => current);
  tails.set(key, tail);
  try {
    await prev;
    return await fn();
  } finally {
    release();
    if (tails.get(key) === tail) tails.delete(key);
  }
}
