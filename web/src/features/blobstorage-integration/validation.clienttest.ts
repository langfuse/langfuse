import {
  AZURE_CONTAINER_NAME_REGEX,
  validateAzureContainerName,
} from "./validation";
import { z } from "zod";

describe("AZURE_CONTAINER_NAME_REGEX", () => {
  const valid = [
    "abc",
    "my-container",
    "a1b2c3",
    "123",
    "a-b",
    "a".repeat(63),
    "container-name-1",
  ];

  const invalid = [
    "ab", // too short
    "a", // too short
    "a".repeat(64), // too long
    "ABC", // uppercase
    "My-Container", // mixed case
    "-abc", // starts with hyphen
    "abc-", // ends with hyphen
    "my--container", // consecutive hyphens
    "has space", // spaces
    "has.dot", // dots
    "has/slash", // slashes
    "Feedback N8N Bot", // the original issue
    "", // empty
  ];

  it.each(valid)("accepts valid name: %s", (name) => {
    expect(AZURE_CONTAINER_NAME_REGEX.test(name)).toBe(true);
  });

  it.each(invalid)("rejects invalid name: %s", (name) => {
    expect(AZURE_CONTAINER_NAME_REGEX.test(name)).toBe(false);
  });
});

describe("validateAzureContainerName via schema", () => {
  const schema = z
    .object({ type: z.string(), bucketName: z.string() })
    .superRefine(validateAzureContainerName);

  it("rejects invalid Azure container name", () => {
    const result = schema.safeParse({
      type: "AZURE_BLOB_STORAGE",
      bucketName: "Feedback N8N Bot",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["bucketName"]);
    }
  });

  it("allows invalid container name for S3 type", () => {
    const result = schema.safeParse({
      type: "S3",
      bucketName: "Feedback N8N Bot",
    });
    expect(result.success).toBe(true);
  });

  it("allows valid Azure container name", () => {
    const result = schema.safeParse({
      type: "AZURE_BLOB_STORAGE",
      bucketName: "valid-container",
    });
    expect(result.success).toBe(true);
  });

  it("skips Azure validation when bucketName is empty", () => {
    const result = schema.safeParse({
      type: "AZURE_BLOB_STORAGE",
      bucketName: "",
    });
    // Should pass superRefine (empty guard), letting .min(1) handle it upstream
    expect(result.success).toBe(true);
  });
});
