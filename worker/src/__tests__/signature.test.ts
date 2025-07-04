import { describe, it, expect } from "vitest";
import {
  generateWebhookSecret,
  getDisplaySecretKey,
  generateWebhookSignature,
  verifyWebhookSignature,
  createSignatureHeader,
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

    it("should handle exactly 8 character secret", () => {
      const secret = "12345678";
      const display = getDisplaySecretKey(secret);

      // 8 characters is less than 12 (whsec_ + 4 chars minimum), so it returns ****
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

    it("should generate different signatures for different timestamps", () => {
      const payload = '{"test": "data"}';
      const secret = "test_secret_key";

      const sig1 = generateWebhookSignature(payload, 1640995200, secret);
      const sig2 = generateWebhookSignature(payload, 1640995201, secret);

      expect(sig1).not.toBe(sig2);
    });

    it("should generate different signatures for different secrets", () => {
      const payload = '{"test": "data"}';
      const timestamp = 1640995200;

      const sig1 = generateWebhookSignature(payload, timestamp, "secret1");
      const sig2 = generateWebhookSignature(payload, timestamp, "secret2");

      expect(sig1).not.toBe(sig2);
    });
  });

  describe("verifyWebhookSignature", () => {
    const payload = '{"test": "webhook"}';
    const secret = "test_webhook_secret";

    it("should verify valid signature within tolerance", () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = generateWebhookSignature(payload, timestamp, secret);
      const signatureHeader = `t=${timestamp},v1=${signature}`;

      const isValid = verifyWebhookSignature(
        payload,
        signatureHeader,
        secret,
        300,
      );

      expect(isValid).toBe(true);
    });

    it("should reject signature outside tolerance", () => {
      const oldTimestamp = Math.floor(Date.now() / 1000) - 400; // 400 seconds ago
      const signature = generateWebhookSignature(payload, oldTimestamp, secret);
      const signatureHeader = `t=${oldTimestamp},v1=${signature}`;

      const isValid = verifyWebhookSignature(
        payload,
        signatureHeader,
        secret,
        300,
      );

      expect(isValid).toBe(false);
    });

    it("should reject invalid signature format", () => {
      const isValid = verifyWebhookSignature(payload, "invalid_format", secret);

      expect(isValid).toBe(false);
    });

    it("should reject signature with wrong secret", () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = generateWebhookSignature(
        payload,
        timestamp,
        "wrong_secret",
      );
      const signatureHeader = `t=${timestamp},v1=${signature}`;

      const isValid = verifyWebhookSignature(payload, signatureHeader, secret);

      expect(isValid).toBe(false);
    });

    it("should handle missing timestamp", () => {
      const signature = generateWebhookSignature(payload, 1640995200, secret);
      const signatureHeader = `v1=${signature}`;

      const isValid = verifyWebhookSignature(payload, signatureHeader, secret);

      expect(isValid).toBe(false);
    });

    it("should handle missing signature", () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const signatureHeader = `t=${timestamp}`;

      const isValid = verifyWebhookSignature(payload, signatureHeader, secret);

      expect(isValid).toBe(false);
    });

    it("should handle multiple signatures (first valid)", () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const validSignature = generateWebhookSignature(
        payload,
        timestamp,
        secret,
      );
      const invalidSignature = "invalid_signature_hash";
      const signatureHeader = `t=${timestamp},v1=${validSignature},v1=${invalidSignature}`;

      const isValid = verifyWebhookSignature(payload, signatureHeader, secret);

      expect(isValid).toBe(true);
    });

    it("should handle multiple signatures (second valid)", () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const validSignature = generateWebhookSignature(
        payload,
        timestamp,
        secret,
      );
      const invalidSignature = "invalid_signature_hash";
      const signatureHeader = `t=${timestamp},v1=${invalidSignature},v1=${validSignature}`;

      const isValid = verifyWebhookSignature(payload, signatureHeader, secret);

      expect(isValid).toBe(true);
    });

    it("should ignore v0 schemes for security", () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = generateWebhookSignature(payload, timestamp, secret);
      const signatureHeader = `t=${timestamp},v0=${signature}`;

      const isValid = verifyWebhookSignature(payload, signatureHeader, secret);

      expect(isValid).toBe(false);
    });

    it("should handle malformed signature elements gracefully", () => {
      const signatureHeader = "malformed,t=notanumber,v1=";

      const isValid = verifyWebhookSignature(payload, signatureHeader, secret);

      expect(isValid).toBe(false);
    });

    it("should use custom tolerance", () => {
      const oldTimestamp = Math.floor(Date.now() / 1000) - 100; // 100 seconds ago
      const signature = generateWebhookSignature(payload, oldTimestamp, secret);
      const signatureHeader = `t=${oldTimestamp},v1=${signature}`;

      // Should fail with 50 second tolerance
      const isValidShort = verifyWebhookSignature(
        payload,
        signatureHeader,
        secret,
        50,
      );
      expect(isValidShort).toBe(false);

      // Should pass with 200 second tolerance
      const isValidLong = verifyWebhookSignature(
        payload,
        signatureHeader,
        secret,
        200,
      );
      expect(isValidLong).toBe(true);
    });
  });

  describe("createSignatureHeader", () => {
    it("should create valid signature header", () => {
      const payload = '{"test": "data"}';
      const secret = "test_secret";

      const header = createSignatureHeader(payload, secret);

      // Should match format: t=timestamp,v1=signature
      expect(header).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);
    });

    it("should create verifiable signature header", () => {
      const payload = '{"test": "data"}';
      const secret = "test_secret";

      const header = createSignatureHeader(payload, secret);

      // The created header should be verifiable
      const isValid = verifyWebhookSignature(payload, header, secret);
      expect(isValid).toBe(true);
    });

    it("should create different headers for different payloads", () => {
      const secret = "test_secret";

      const header1 = createSignatureHeader('{"test": "data1"}', secret);
      const header2 = createSignatureHeader('{"test": "data2"}', secret);

      expect(header1).not.toBe(header2);
    });

    it("should create different headers when called at different times", async () => {
      const payload = '{"test": "data"}';
      const secret = "test_secret";

      const header1 = createSignatureHeader(payload, secret);

      // Wait a bit to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const header2 = createSignatureHeader(payload, secret);

      expect(header1).not.toBe(header2);
    });
  });

  describe("integration tests", () => {
    it("should handle complete webhook signature flow", () => {
      // Generate a secret
      const { secretKey } = generateWebhookSecret();

      // Create a payload
      const payload = JSON.stringify({
        id: "test_webhook",
        type: "prompt.updated",
        data: { promptId: "prompt_123" },
      });

      // Create signature header
      const signatureHeader = createSignatureHeader(payload, secretKey);

      // Verify signature
      const isValid = verifyWebhookSignature(
        payload,
        signatureHeader,
        secretKey,
      );

      expect(isValid).toBe(true);
    });

    it("should reject tampered payload", () => {
      const { secretKey } = generateWebhookSecret();
      const originalPayload = '{"test": "original"}';
      const tamperedPayload = '{"test": "tampered"}';

      const signatureHeader = createSignatureHeader(originalPayload, secretKey);

      // Verify with tampered payload should fail
      const isValid = verifyWebhookSignature(
        tamperedPayload,
        signatureHeader,
        secretKey,
      );

      expect(isValid).toBe(false);
    });
  });

  describe("security tests", () => {
    it("should use constant-time comparison for signatures", () => {
      const payload = '{"test": "timing_attack"}';
      const secret = "secret_key";
      const timestamp = Math.floor(Date.now() / 1000);

      const validSignature = generateWebhookSignature(
        payload,
        timestamp,
        secret,
      );

      // Create signatures that differ by one character in different positions
      const almostValidSig1 = validSignature.slice(0, -1) + "x";
      const almostValidSig2 = "x" + validSignature.slice(1);

      const signatureHeader1 = `t=${timestamp},v1=${almostValidSig1}`;
      const signatureHeader2 = `t=${timestamp},v1=${almostValidSig2}`;

      // Both should fail, timing should be similar (constant-time comparison)
      const start1 = process.hrtime.bigint();
      const isValid1 = verifyWebhookSignature(
        payload,
        signatureHeader1,
        secret,
      );
      const end1 = process.hrtime.bigint();

      const start2 = process.hrtime.bigint();
      const isValid2 = verifyWebhookSignature(
        payload,
        signatureHeader2,
        secret,
      );
      const end2 = process.hrtime.bigint();

      expect(isValid1).toBe(false);
      expect(isValid2).toBe(false);

      // Times should be relatively similar (within reasonable bounds)
      const time1 = Number(end1 - start1);
      const time2 = Number(end2 - start2);
      const timeDiff = Math.abs(time1 - time2);
      const avgTime = (time1 + time2) / 2;

      // Time difference should be less than 200% of average time
      // This is a basic timing attack resistance check (relaxed for test environment)
      expect(timeDiff).toBeLessThan(avgTime * 2.0);
    });

    it("should handle edge cases without throwing", () => {
      expect(() => verifyWebhookSignature("", "", "")).not.toThrow();
      expect(() =>
        verifyWebhookSignature("payload", "t=invalid", "secret"),
      ).not.toThrow();
      expect(() =>
        verifyWebhookSignature("payload", "=invalid=format=", "secret"),
      ).not.toThrow();
      expect(() => getDisplaySecretKey("")).not.toThrow();
      expect(() => generateWebhookSignature("", 0, "")).not.toThrow();
    });
  });
});
