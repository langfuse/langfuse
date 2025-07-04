import crypto from "crypto";

// Generate a webhook secret key
export function generateWebhookSecret(): {
  secretKey: string;
  displaySecretKey: string;
} {
  // Generate 32 random bytes and encode as hex (64 characters)
  const rawSecret = crypto.randomBytes(32).toString("hex");
  const secretKey = `whsec_${rawSecret}`;
  return { secretKey, displaySecretKey: getDisplaySecretKey(secretKey) };
}

// Create display version of webhook secret
export function getDisplaySecretKey(secretKey: string): string {
  if (!secretKey || secretKey.length < 12) {
    // whsec_ + at least 4 chars
    return "****";
  }

  return `whsec_...${secretKey.slice(-4)}`;
}

// Extract the raw secret from a prefixed webhook secret
function extractRawSecret(secret: string): string {
  return secret.slice(6); // Remove "whsec_" prefix
}

// Generate HMAC-SHA256 signature for webhook payload
export function generateWebhookSignature(
  payload: string,
  timestamp: number,
  secret: string,
) {
  const rawSecret = extractRawSecret(secret);
  const signedPayload = `${timestamp}.${payload}`;
  return crypto
    .createHmac("sha256", rawSecret)
    .update(signedPayload, "utf8")
    .digest("hex");
}

export function createSignatureHeader(payload: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = generateWebhookSignature(payload, timestamp, secret);
  return `t=${timestamp},v1=${signature}`;
}
