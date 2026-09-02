import { createRequire } from "module";
import path from "node:path";

import { describe, expect, it } from "vitest";
import dd from "dd-trace";

const nodeRequire = createRequire(path.join(process.cwd(), "package.json"));

describe("dd-trace wrapSmithySend region safety", () => {
  it("does not emit unhandledRejection when client.config.region() rejects", async () => {
    dd.init({
      plugins: false,
      startupLogs: false,
    });
    dd.use("aws-sdk");

    const { S3Client, PutObjectCommand } = nodeRequire(
      "@aws-sdk/client-s3",
    ) as {
      S3Client: new (config: {
        region: string;
        credentials: { accessKeyId: string; secretAccessKey: string };
      }) => {
        send: (command: unknown) => Promise<unknown>;
      };
      PutObjectCommand: new (input: {
        Bucket: string;
        Key: string;
        Body: string;
      }) => unknown;
    };

    expect(S3Client.prototype.send.toString()).toContain("this.config.region");

    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);

    try {
      const client = new S3Client({
        region: " us-west-2",
        credentials: {
          accessKeyId: "test",
          secretAccessKey: "test",
        },
      });

      await expect(
        client.send(
          new PutObjectCommand({
            Bucket: "test-bucket",
            Key: "test-key",
            Body: "x",
          }),
        ),
      ).rejects.toThrow(/Region not accepted/);

      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });

      expect(unhandled).toHaveLength(0);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});
