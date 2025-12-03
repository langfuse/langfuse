type OmitKeys<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

/**
 * Removes specified keys from an object and returns a new object without those keys.
 */

export function removeObjectKeys<T, K extends keyof T>(
  obj: T,
  keys: K[],
): OmitKeys<T, K> {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result;
}
