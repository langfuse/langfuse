import { describe, it, expect } from "vitest";
import {
  generateWebhookSecret,
  getDisplaySecretKey,
  generateWebhookSignature,
} from "@langfuse/shared/encryption";

describe("signature.ts", () => {
  describe("generateWebhookSecret", () => {
    it("should generate a webhook secret with correct format", () => {
      const result = generateWebhookSecret();

      expect(result).toHaveProperty("secretKey");
      expect(result).toHaveProperty("displaySecretKey");

      // Secret key should be whsec_ prefix + 64 hex characters (32 bytes)
      expect(result.secretKey).toMatch(/^whsec_[a-f0-9]{64}$/);
      expect(result.secretKey).toHaveLength(70); // whsec_ (6) + 64 hex chars

      // Display secret should be properly formatted
      expect(result.displaySecretKey).toMatch(/^whsec_\.\.\.[a-f0-9]{4}$/);
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

      expect(display).toBe("whsec_...7890");
    });

    it("should handle short secrets with default masking", () => {
      const shortSecret = "abc123";
      const display = getDisplaySecretKey(shortSecret);

      expect(display).toBe("****");
    });

    it("should handle empty secret", () => {
      const display = getDisplaySecretKey("");

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

  describe("createHmacSignature", () => {
    it("should create HMAC signature matching your requirements", () => {
      const payload = '{"test": "webhook"}';
      const secret = "test_webhook_secret";

      const signature = createHmacSignature(payload, secret);

      // Should be 64 character hex string
      expect(signature).toMatch(/^[a-f0-9]{64}$/);
      expect(signature).toHaveLength(64);
    });

    it("should generate consistent signatures", () => {
      const payload = '{"test": "webhook"}';
      const secret = "test_webhook_secret";

      const sig1 = createHmacSignature(payload, secret);
      const sig2 = createHmacSignature(payload, secret);

      expect(sig1).toBe(sig2);
    });

    it("should generate different signatures for different secrets", () => {
      const payload = '{"test": "webhook"}';

      const sig1 = createHmacSignature(payload, "secret1");
      const sig2 = createHmacSignature(payload, "secret2");

      expect(sig1).not.toBe(sig2);
    });

    it("should generate different signatures for different payloads", () => {
      const secret = "test_webhook_secret";

      const sig1 = createHmacSignature('{"test": "data1"}', secret);
      const sig2 = createHmacSignature('{"test": "data2"}', secret);

      expect(sig1).not.toBe(sig2);
    });
  });

  describe("compareSignatures", () => {
    it("should compare signatures correctly", () => {
      const payload = '{"test": "webhook"}';
      const secret = "test_webhook_secret";

      const signature1 = createHmacSignature(payload, secret);
      const signature2 = createHmacSignature(payload, secret);
      const differentSignature = createHmacSignature(
        payload,
        "different_secret",
      );

      expect(compareSignatures(signature1, signature2)).toBe(true);
      expect(compareSignatures(signature1, differentSignature)).toBe(false);
    });

    it("should handle different length signatures", () => {
      const signature1 = createHmacSignature('{"test": "data"}', "secret");
      const shortSignature = "abc123";

      expect(compareSignatures(signature1, shortSignature)).toBe(false);
    });
  });
});

// Simple HMAC signature creation (matching your requirements)
function createHmacSignature(payload: string, secretKey: string): string {
  return require("crypto")
    .createHmac("sha256", secretKey)
    .update(payload)
    .digest("hex");
}

// Simple signature comparison (matching your requirements)
function compareSignatures(
  signature: string,
  comparisonSignature: string,
): boolean {
  const source = Buffer.from(signature);
  const comparison = Buffer.from(comparisonSignature);

  if (source.length !== comparison.length) {
    return false;
  }

  return require("crypto").timingSafeEqual(source, comparison);
}
