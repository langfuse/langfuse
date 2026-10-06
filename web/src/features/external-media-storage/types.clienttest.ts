import { describe, expect, it } from "vitest";

import { externalMediaStorageFormSchema } from "@/src/features/external-media-storage/types";

const validConfiguration = {
  type: "S3" as const,
  bucketName: "media-bucket",
  endpoint: null,
  region: "us-east-1",
  accessKeyId: "access-key",
  secretAccessKey: "secret-key",
  prefix: "",
  forcePathStyle: false,
};

describe("externalMediaStorageFormSchema", () => {
  it("requires an endpoint for S3-compatible storage", () => {
    expect(
      externalMediaStorageFormSchema.safeParse({
        ...validConfiguration,
        type: "S3_COMPATIBLE",
      }).success,
    ).toBe(false);
  });

  it("requires an access key", () => {
    expect(
      externalMediaStorageFormSchema.safeParse({
        ...validConfiguration,
        accessKeyId: "",
      }).success,
    ).toBe(false);
  });
});
