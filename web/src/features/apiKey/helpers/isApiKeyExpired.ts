/** isApiKeyExpired reports whether an api key's expiry is at or before now; a null expiry never expires. */
export function isApiKeyExpired(
  expiresAt: Date | string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() <= now;
}
