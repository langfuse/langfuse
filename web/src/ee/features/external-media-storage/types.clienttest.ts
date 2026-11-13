import { describe, expect, it } from "vitest";

import { externalMediaStorageFormSchema } from "@/src/ee/features/external-media-storage/types";

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

  it.each(["/", "media//", "media*/", "team?/", "${aws:username}/"])(
    "rejects the IAM role auth prefix %j",
    (prefix) => {
      const result = externalMediaStorageFormSchema.safeParse({
        ...validConfiguration,
        authType: "ROLE_ARN",
        accessKeyId: null,
        secretAccessKey: null,
        roleArn: "arn:aws:iam::123456789012:role/langfuse-media",
        prefix,
      });
      expect(result.error?.issues.map((issue) => issue.path)).toEqual([
        ["prefix"],
      ]);
    },
  );

  it("rejects a role ARN in a partition without S3 KMS support", () => {
    const result = externalMediaStorageFormSchema.safeParse({
      ...validConfiguration,
      authType: "ROLE_ARN",
      accessKeyId: null,
      secretAccessKey: null,
      roleArn: "arn:aws-iso:iam::123456789012:role/langfuse-media",
    });
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([
      ["roleArn"],
    ]);
  });
});
