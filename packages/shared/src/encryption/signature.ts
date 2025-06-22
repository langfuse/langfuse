import crypto from "crypto";

// Generate a webhook secret key
export function generateWebhookSecret(): {
  secretKey: string;
  displaySecretKey: string;
} {
  // Generate 32 random bytes and encode as hex (64 characters)
  const secretKey = crypto.randomBytes(32).toString("hex");
  return { secretKey, displaySecretKey: getDisplaySecretKey(secretKey) };
}

// Create display version of webhook secret
export function getDisplaySecretKey(secretKey: string): string {
  if (!secretKey || secretKey.length < 8) {
    return "****";
  }
  return `whsec_...${secretKey.slice(-4)}`;
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

// Verify webhook signature (similar to Stripe's approach)
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
  tolerance: number = 300, // 5 minutes tolerance
): boolean {
  try {
    // Parse the signature header: t=timestamp,v1=signature
    const elements = signature.split(",");
    let timestamp: number | null = null;
    const signatures: string[] = [];

    for (const element of elements) {
      const [key, value] = element.split("=", 2);
      if (key === "t") {
        timestamp = parseInt(value, 10);
      } else if (key === "v1") {
        signatures.push(value);
      }
      // Ignore v0 and other schemes for security
    }

    if (!timestamp || signatures.length === 0) {
      return false;
    }

    // Check timestamp tolerance
    const currentTime = Math.floor(Date.now() / 1000);
    if (Math.abs(currentTime - timestamp) > tolerance) {
      return false;
    }

    // Generate expected signature
    const expectedSignature = generateWebhookSignature(
      payload,
      timestamp,
      secret,
    );

    // Compare signatures using constant-time comparison to prevent timing attacks
    for (const sig of signatures) {
      if (constantTimeCompare(expectedSignature, sig)) {
        return true;
      }
    }

    return false;
  } catch (error) {
    return false;
  }
}

// Constant-time string comparison to prevent timing attacks
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

// Create Langfuse-Signature header value
export function createSignatureHeader(payload: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = generateWebhookSignature(payload, timestamp, secret);
  return `t=${timestamp},v1=${signature}`;
}

// Export verification function for users to implement in their webhook endpoints
export { verifyWebhookSignature as verifyLangfuseWebhookSignature };
