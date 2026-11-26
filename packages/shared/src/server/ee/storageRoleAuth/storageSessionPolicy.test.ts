import { describe, expect, it } from "vitest";

import { buildStorageReadSessionPolicy } from "./storageSessionPolicy";

describe("buildStorageReadSessionPolicy", () => {
  it("scopes reads to the prefix in the role's partition", () => {
    const policy = JSON.parse(
      buildStorageReadSessionPolicy({
        roleArn: "arn:aws-cn:iam::123456789012:role/media-reader",
        bucketName: "media",
        prefix: "team/",
        region: "cn-north-1",
      }),
    );

    const objectArn = "arn:aws-cn:s3:::media/team/*";
    expect(policy.Statement).toEqual([
      { Effect: "Allow", Action: ["s3:GetObject"], Resource: objectArn },
      {
        Effect: "Allow",
        Action: ["kms:Decrypt"],
        Resource: "*",
        Condition: {
          StringEquals: {
            "kms:ViaService": "s3.cn-north-1.amazonaws.com.cn",
          },
          StringLike: {
            "kms:EncryptionContext:aws:s3:arn": [
              objectArn,
              "arn:aws-cn:s3:::media",
            ],
          },
        },
      },
    ]);
  });
});
