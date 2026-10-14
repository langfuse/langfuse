import { timingSafeEqual } from "node:crypto";

/** matchesAdminApiKey compares a token against the nonempty, trimmed admin secret. */
export function matchesAdminApiKey(
  token: string,
  configuredKey: string | undefined,
): boolean {
  const adminApiKey = configuredKey?.trim();
  if (!adminApiKey) return false;
  return timingSafeTokenEquals(token, adminApiKey);
}

function timingSafeTokenEquals(token: string, expectedToken: string): boolean {
  const supplied = Buffer.from(token);
  const expected = Buffer.from(expectedToken);
  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  );
}
