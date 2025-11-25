import crypto from "crypto";

// Generate a webhook secret key
export function generateWebhookSecret(): {
  secretKey: string;
  displaySecretKey: string;
} {
  // Generate 32 random bytes and encode as hex (64 characters)
  const rawSecret = crypto.randomBytes(32).toString("hex");
  const secretKey = `lf-whsec_${rawSecret}`;
  return { secretKey, displaySecretKey: getDisplaySecretKey(secretKey) };
}

// Create display version of webhook secret
export function getDisplaySecretKey(secretKey: string): string {
  if (!secretKey || secretKey.length < 12) {
    // whsec_ + at least 4 chars
    return "****";
  }

  return `lf-whsec_...${secretKey.slice(-4)}`;
}

// Generate HMAC-SHA256 signature for webhook payload
export function generateWebhookSignature(
  payload: string,
  timestamp: number,
  secret: string,
) {
  const signedPayload = `${timestamp}.${payload}`;
  return crypto
    .createHmac("sha256", secret)
    .update(signedPayload, "utf8")
    .digest("hex");
}

export function createSignatureHeader(payload: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = generateWebhookSignature(payload, timestamp, secret);
  return `t=${timestamp},v1=${signature}`;
}
