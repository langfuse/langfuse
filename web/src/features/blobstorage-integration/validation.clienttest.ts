// @vitest-environment node

import {
  AZURE_CONTAINER_NAME_REGEX,
  validateAzureContainerName,
} from "./validation";
import { blobStorageIntegrationFormSchemaBase } from "./types";
import { CreateBlobStorageIntegrationRequest } from "@/src/features/public-api/types/blob-storage-integrations";
import { z } from "zod";

describe("blob storage region normalization", () => {
  it("trims regions submitted through the settings form", () => {
    expect(
      blobStorageIntegrationFormSchemaBase.shape.region.parse(" us-west-2"),
    ).toBe("us-west-2");
  });

  it("trims regions submitted through the public API", () => {
    expect(
      CreateBlobStorageIntegrationRequest.shape.region.parse(" us-west-2"),
    ).toBe("us-west-2");
  });

  it.each(["europe-west1", "eastus", "auto", "US", "wnam"])(
    "accepts S3-compatible provider region %s",
    (region) => {
      expect(
        blobStorageIntegrationFormSchemaBase.shape.region.parse(region),
      ).toBe(region);
      expect(
        CreateBlobStorageIntegrationRequest.shape.region.parse(region),
      ).toBe(region);
    },
  );

  it.each([
    "us west-2",
    "East US",
    "US-CENTRAL1+US-EAST1",
    "-us-west-2",
    "us-west-2-",
    "a".repeat(64),
  ])("rejects a region the S3 client cannot use: %s", (region) => {
    expect(
      blobStorageIntegrationFormSchemaBase.shape.region.safeParse(region)
        .success,
    ).toBe(false);
    expect(
      CreateBlobStorageIntegrationRequest.shape.region.safeParse(region)
        .success,
    ).toBe(false);
  });
});

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
