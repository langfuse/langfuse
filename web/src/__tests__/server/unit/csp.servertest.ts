import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("Content Security Policy", () => {
  it("allows the local MinIO endpoint in Docker builds", () => {
    const csp = execFileSync(
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
        },
        encoding: "utf8",
      },
    );

    expect(csp).toContain("connect-src 'self' http://localhost:*");
  });
});
