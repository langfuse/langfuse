const SECRET_KEY_PREFIX = "sk-lf-";
const VISIBLE_CHARACTERS = 4;
const MASK = "•".repeat(20);

/** Keeps the `sk-lf-` prefix plus the first and last four characters readable. */
export function maskSecretKey(secretKey: string) {
  const prefixLength = secretKey.startsWith(SECRET_KEY_PREFIX)
    ? SECRET_KEY_PREFIX.length
    : 0;
  const secretPart = secretKey.slice(prefixLength);
  if (secretPart.length <= VISIBLE_CHARACTERS * 2) return MASK;
  return `${secretKey.slice(0, prefixLength + VISIBLE_CHARACTERS)}${MASK}${secretKey.slice(-VISIBLE_CHARACTERS)}`;
}
