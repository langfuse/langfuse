// NOTE: this test should be in the packages/shared directory, but we don't have a test setup there yet.
// TODO: move test to shared and create test setup there.
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { encrypt, decrypt, keyGen } from "@langfuse/shared/encryption";
import crypto from "crypto";

// Mock environment variable for testing
const originalEnv = process.env.ENCRYPTION_KEY;

beforeAll(() => {
  // Set a test encryption key (64 hex characters = 32 bytes)
  process.env.ENCRYPTION_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
});

afterAll(() => {
  // Restore original environment
  process.env.ENCRYPTION_KEY = originalEnv;
});

describe("encryption", () => {
  describe("keyGen", () => {
    it("should generate a 64 character hex key", () => {
      const key = keyGen();
      expect(key).toHaveLength(64);
      expect(key).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe("encrypt", () => {
    it("should encrypt with mocked randomness", () => {
      const mockRandomBytes = vi.spyOn(crypto, "randomBytes");
      // Mock IV (12 bytes) - using a fixed value
      mockRandomBytes.mockReturnValue(
        Buffer.from("aabbccddeeff00112233", "hex"),
      );

      const plainText = "Hello, World!";
      const expectedEncrypted =
        "aabbccddeeff00112233:5c40ad18eaeccee16fd195c5a2:fa3fb54e39fd23981ad146fe6ea4ec56";

      // Test encrypt produces expected output
      const encrypted = encrypt(plainText);
      expect(encrypted).toBe(expectedEncrypted);

      mockRandomBytes.mockRestore();
    });
  });

  describe("decrypt", () => {
    it("should decrypt known encrypted value", () => {
      const encryptedValue =
        "aabbccddeeff00112233:5c40ad18eaeccee16fd195c5a2:fa3fb54e39fd23981ad146fe6ea4ec56";
      const expectedPlainText = "Hello, World!";

      const decrypted = decrypt(encryptedValue);
      expect(decrypted).toBe(expectedPlainText);
    });
  });

  describe("encrypt -> decrypt roundtrip", () => {
    it("should encrypt then decrypt back to original", () => {
      const plainText = "Test message with real randomness!";

      const encrypted = encrypt(plainText);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plainText);
    });
  });
});
