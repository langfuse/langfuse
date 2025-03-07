import crypto from "crypto";
import { env } from "../env";

const ENCRYPTION_KEY: string | undefined = env.ENCRYPTION_KEY; // Must be 256 bits (32 bytes, 64 hex characters)
const IV_LENGTH: number = 12; // For AES-GCM, this is always 12

// Alternatively: openssl rand -hex 32
export function keyGen() {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Encrypts the given plain text using AES-256-GCM algorithm.
 *
 * @param {string} plainText - The text to encrypt.
 * @returns {string} The encrypted data in hex format, including IV and authentication tag.
 */
export function encrypt(plainText: string): string {
  if (!ENCRYPTION_KEY) {
    throw new Error("Missing environment variable: `ENCRYPTION_KEY`");
  }
  const iv = crypto.randomBytes(IV_LENGTH); // Directly use Buffer returned by randomBytes
  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    Buffer.from(ENCRYPTION_KEY, "hex"),
    iv,
  );
  let encrypted = cipher.update(plainText, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();

  // Return iv, encrypted data, and authTag as hex, combined in one line
  return iv.toString("hex") + ":" + encrypted + ":" + authTag.toString("hex");
}

export function decrypt(text: string): string {
  if (!ENCRYPTION_KEY) {
    throw new Error("Missing environment variable: `ENCRYPTION_KEY`");
  }
  const [ivHex, encryptedHex, authTagHex] = text.split(":");
  if (!ivHex || !encryptedHex || !authTagHex) {
    throw new Error("Invalid or corrupted cipher format");
  }

  const iv = Buffer.from(ivHex, "hex");
  const encryptedText = Buffer.from(encryptedHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    Buffer.from(ENCRYPTION_KEY, "hex"),
    iv,
  );
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedText, undefined, "utf8");
  decrypted += decipher.final("utf8");

  return decrypted.toString();
}
