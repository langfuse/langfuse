import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const getCsp = (cloudRegion?: string) =>
  execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `
        const config = (await import("./next.config.mjs")).default;
        const headers = await config.headers();
        console.log(headers.flatMap((rule) => rule.headers).find((header) => header.key === "Content-Security-Policy").value);
      `,
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DOCKER_BUILD: "1",
        LANGFUSE_S3_MEDIA_UPLOAD_ENDPOINT: "",
        NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: cloudRegion,
      },
      encoding: "utf8",
    },
  );

describe("Content Security Policy", () => {
  it("allows the local MinIO endpoint in self-hosted Docker builds", () => {
    expect(getCsp()).toContain("connect-src 'self' http://localhost:*");
  });

  it("does not allow local connections in Cloud", () => {
    expect(getCsp("US")).not.toContain("connect-src 'self' http://localhost:*");
  });
});
