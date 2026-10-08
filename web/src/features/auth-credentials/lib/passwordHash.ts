import { getFips, pbkdf2, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { compare, hash } from "bcryptjs";

const pbkdf2Async = promisify(pbkdf2);

const BCRYPT_COST = 12;
const BCRYPT_HASH_PATTERN = /^\$2[aby]\$/;

// PHC string format: $pbkdf2-sha256$i=<iterations>$<salt>$<key>, with
// unpadded base64 salt and key.
const PBKDF2_PREFIX = "$pbkdf2-sha256$";
const PBKDF2_ITERATIONS = 600_000;
const PBKDF2_SALT_BYTES = 16;
const PBKDF2_KEY_BYTES = 32;
// NIST SP 800-132 minimums for an approved PBKDF2 use; a stored hash below
// them is treated as malformed.
const PBKDF2_MIN_SALT_BYTES = 16;
const PBKDF2_MIN_KEY_BYTES = 14;
const PBKDF2_MIN_ITERATIONS = 1_000;

/**
 * hashesWithPbkdf2 is true when Node runs with the OpenSSL FIPS provider.
 * bcrypt is not FIPS-approved, so FIPS hosts hash passwords with
 * PBKDF2-HMAC-SHA256; other hosts keep bcrypt. Both formats verify everywhere.
 */
function hashesWithPbkdf2(): boolean {
  return getFips() === 1;
}

/** hashPassword hashes a password in the format this host writes. */
export async function hashPassword(password: string): Promise<string> {
  if (!hashesWithPbkdf2()) {
    return hash(password, BCRYPT_COST);
  }

  const salt = randomBytes(PBKDF2_SALT_BYTES);
  const key = await pbkdf2Async(
    password,
    salt,
    PBKDF2_ITERATIONS,
    PBKDF2_KEY_BYTES,
    "sha256",
  );
  return `${PBKDF2_PREFIX}i=${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(key)}`;
}

/** verifyPassword checks a password against a bcrypt or PBKDF2 hash; any other stored value never matches. */
export async function verifyPassword(
  password: string,
  hashedPassword: string,
): Promise<boolean> {
  if (BCRYPT_HASH_PATTERN.test(hashedPassword)) {
    return compare(password, hashedPassword);
  }

  const parsed = parsePbkdf2Hash(hashedPassword);
  if (!parsed) return false;

  const key = await pbkdf2Async(
    password,
    parsed.salt,
    parsed.iterations,
    parsed.key.length,
    "sha256",
  );
  return timingSafeEqual(key, parsed.key);
}

/** passwordNeedsRehash is true when a verified hash should be replaced by the format this host writes. */
export function passwordNeedsRehash(hashedPassword: string): boolean {
  if (!hashesWithPbkdf2()) return false;

  const parsed = parsePbkdf2Hash(hashedPassword);
  return !parsed || parsed.iterations < PBKDF2_ITERATIONS;
}

function parsePbkdf2Hash(
  hashedPassword: string,
): { iterations: number; salt: Buffer; key: Buffer } | null {
  if (!hashedPassword.startsWith(PBKDF2_PREFIX)) return null;

  const parts = hashedPassword.slice(PBKDF2_PREFIX.length).split("$");
  if (parts.length !== 3) return null;
  const [params, salt, key] = parts;

  const iterations = Number(/^i=(\d+)$/.exec(params ?? "")?.[1]);
  if (!Number.isSafeInteger(iterations)) return null;
  if (iterations < PBKDF2_MIN_ITERATIONS) return null;

  const saltBytes = Buffer.from(salt ?? "", "base64");
  const keyBytes = Buffer.from(key ?? "", "base64");
  if (saltBytes.length < PBKDF2_MIN_SALT_BYTES) return null;
  if (keyBytes.length < PBKDF2_MIN_KEY_BYTES) return null;

  return { iterations, salt: saltBytes, key: keyBytes };
}

function toBase64(bytes: Buffer): string {
  return bytes.toString("base64").replace(/=+$/, "");
}
