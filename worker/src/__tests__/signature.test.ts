import { describe, it, expect } from "vitest";
import {
  generateWebhookSecret,
  getDisplaySecretKey,
  generateWebhookSignature,
  createSignatureHeader,
} from "@langfuse/shared/encryption";

describe("signature.ts", () => {
  describe("generateWebhookSecret", () => {
    it("should generate a webhook secret with correct format", () => {
      const result = generateWebhookSecret();

      expect(result).toHaveProperty("secretKey");
      expect(result).toHaveProperty("displaySecretKey");

      // Secret key should be lf-whsec_ prefix + 64 hex characters (32 bytes)
      expect(result.secretKey).toMatch(/^lf-whsec_[a-f0-9]{64}$/);
      expect(result.secretKey).toHaveLength(73); // lf-whsec_ (9) + 64 hex chars

      // Display secret should be properly formatted
      expect(result.displaySecretKey).toMatch(/^lf-whsec_\.\.\.[a-f0-9]{4}$/);
    });

    it("should generate different secrets on each call", () => {
      const secret1 = generateWebhookSecret();
      const secret2 = generateWebhookSecret();

      expect(secret1.secretKey).not.toBe(secret2.secretKey);
      expect(secret1.displaySecretKey).not.toBe(secret2.displaySecretKey);
    });
  });

  describe("getDisplaySecretKey", () => {
    it("should create display version for valid secret", () => {
      const secretKey =
        "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
      const display = getDisplaySecretKey(secretKey);

      expect(display).toBe("lf-whsec_...7890");
    });

    it("should handle short secrets with default masking", () => {
      const shortSecret = "abc123";
      const display = getDisplaySecretKey(shortSecret);

      expect(display).toBe("****");
    });
  });

  describe("generateWebhookSignature", () => {
    it("should generate consistent signatures for same inputs", () => {
      const payload = '{"test": "data"}';
      const timestamp = 1640995200; // Fixed timestamp
      const secret = "test_secret_key";

      const signature1 = generateWebhookSignature(payload, timestamp, secret);
      const signature2 = generateWebhookSignature(payload, timestamp, secret);

      expect(signature1).toBe(signature2);
      expect(signature1).toMatch(/^[a-f0-9]{64}$/); // SHA256 hex output
    });

    it("should generate different signatures for different payloads", () => {
      const timestamp = 1640995200;
      const secret = "test_secret_key";

      const sig1 = generateWebhookSignature(
        '{"test": "data1"}',
        timestamp,
        secret,
      );
      const sig2 = generateWebhookSignature(
        '{"test": "data2"}',
        timestamp,
        secret,
      );

      expect(sig1).not.toBe(sig2);
    });
  });

  describe("createSignatureHeader", () => {
    it("should create properly formatted signature header", () => {
      const payload = '{"test": "webhook"}';
      const secret = "test_webhook_secret";

      const header = createSignatureHeader(payload, secret);

      // Should match format: t=timestamp,v1=signature
      expect(header).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);
    });
  });

  describe("User webhook verification", () => {
    it("should allow users to verify our webhook signatures", () => {
      const { secretKey } = generateWebhookSecret();
      const payload = '{"event": "trace.created", "data": {"id": "123"}}';
      const signatureHeader = createSignatureHeader(payload, secretKey);

      // User verification process
      const isValid = verifyWebhookSignature(
        payload,
        signatureHeader,
        secretKey,
      );
      expect(isValid).toBe(true);
    });

    it("should reject invalid signatures when users verify", () => {
      const { secretKey } = generateWebhookSecret();
      const wrongSecret = "wrong_secret";
      const payload = '{"event": "trace.created"}';
      const signatureHeader = createSignatureHeader(payload, secretKey);

      const isValid = verifyWebhookSignature(
        payload,
        signatureHeader,
        wrongSecret,
      );
      expect(isValid).toBe(false);
    });
  });
});

// Example verification function that users would implement
function verifyWebhookSignature(
  payload: string,
  signatureHeader: string,
  secret: string,
): boolean {
  try {
    const [timestampPart, signaturePart] = signatureHeader.split(",");

    if (!timestampPart || !signaturePart) {
      return false;
    }

    const timestamp = parseInt(timestampPart.split("=")[1]);
    const receivedSignature = signaturePart.split("=")[1];

    if (!timestamp || !receivedSignature) {
      return false;
    }

    // Generate expected signature using our provided function
    const expectedSignature = generateWebhookSignature(
      payload,
      timestamp,
      secret,
    );

    // Use timing-safe comparison
    return require("crypto").timingSafeEqual(
      Buffer.from(receivedSignature),
      Buffer.from(expectedSignature),
    );
  } catch (error) {
    return false;
  }
}
