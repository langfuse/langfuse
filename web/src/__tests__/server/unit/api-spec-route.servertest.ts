import handler from "@/src/pages/api/docs";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";

const callHandler = (
  method: "GET" | "HEAD" | "POST",
  query: Record<string, string> = {},
) => {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method,
    query,
  });
  handler(req, res);
  return res;
};

describe("/api/docs", () => {
  it("renders the deployment-local specification with local assets", () => {
    const res = callHandler("GET");
    const body = res._getData() as string;

    expect(res.statusCode).toBe(200);
    expect(res.getHeader("Content-Type")).toBe("text/html; charset=utf-8");
    expect(body).toContain("<title>Langfuse API Reference</title>");
    expect(body).toMatch(/src="\?asset=scalar-api-reference-[a-f0-9]{12}\.js"/);
    expect(body).toContain('"url":"openapi.yaml"');
    expect(body).toContain('"agent":{"disabled":true}');
    expect(body).toContain('"mcp":{"name":"Langfuse API"');
    expect(body).toContain('"telemetry":false');
    expect(body).toContain('"hideClientButton":true');
    expect(body).toContain('"withDefaultFonts":false');
    expect(body).not.toMatch(/https?:\/\//);
  });

  it("serves the packaged Scalar standalone asset", () => {
    const body = callHandler("GET")._getData() as string;
    const asset = body.match(/src="\?asset=([^"]+)"/)?.[1];
    expect(asset).toMatch(/^scalar-api-reference-[a-f0-9]{12}\.js$/);

    const res = callHandler("GET", { asset: asset! });

    expect(res.statusCode).toBe(200);
    expect(res.getHeader("Content-Type")).toBe(
      "text/javascript; charset=utf-8",
    );
    expect(res.getHeader("Cache-Control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(res._getData().toString()).toContain("Scalar");
  });

  it("retains Scalar's MIT notice for redistribution", () => {
    const license = readFileSync(
      join(
        process.cwd(),
        "third-party-licenses/scalar-api-reference.LICENSE.txt",
      ),
      "utf8",
    );

    expect(license).toContain("Copyright (c) 2023-present Scalar");
    expect(license).toContain(
      "The above copyright notice and this permission notice shall be included",
    );
  });

  it("keeps the specification URL within a deployment base path", () => {
    const body = callHandler("GET")._getData() as string;
    const relativeSpecUrl = body.match(/"url":"([^"]+)"/)?.[1];

    expect(relativeSpecUrl).toBe("openapi.yaml");
    expect(
      new URL(
        relativeSpecUrl!,
        "https://langfuse.example.com/langfuse/api/docs",
      ).pathname,
    ).toBe("/langfuse/api/openapi.yaml");
  });

  it("aliases the standard OpenAPI path to the existing generated spec", () => {
    const rewrites = JSON.parse(
      execFileSync(
        process.execPath,
        [
          "--input-type=module",
          "--eval",
          `
            const config = (await import("./next.config.mjs")).default;
            console.log(JSON.stringify(await config.rewrites()));
          `,
        ],
        {
          cwd: process.cwd(),
          encoding: "utf8",
        },
      ),
    ) as Array<{ source: string; destination: string }>;

    expect(rewrites).toContainEqual({
      source: "/api/openapi.yaml",
      destination: "/generated/api/openapi.yml",
    });
  });

  it.each(["unknown.js", "constructor", "toString", "__proto__"])(
    "rejects the unknown asset name %s",
    (asset) => {
      expect(callHandler("GET", { asset }).statusCode).toBe(404);
    },
  );

  it("supports metadata requests without sending the document", () => {
    const res = callHandler("HEAD");

    expect(res.statusCode).toBe(200);
    expect(res.getHeader("Content-Type")).toBe("text/html; charset=utf-8");
    expect(res._getData()).toBe("");
  });

  it("rejects unsupported methods", () => {
    const res = callHandler("POST");

    expect(res.statusCode).toBe(405);
    expect(res.getHeader("Allow")).toBe("GET, HEAD");
  });
});
