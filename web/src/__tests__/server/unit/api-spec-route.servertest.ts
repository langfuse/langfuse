import handler from "@/src/pages/api/spec";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";

const callHandler = (method: "GET" | "HEAD" | "POST") => {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({ method });
  handler(req, res);
  return res;
};

describe("/api/spec", () => {
  it("renders the deployed API specification with local assets", () => {
    const res = callHandler("GET");
    const body = res._getData() as string;

    expect(res.statusCode).toBe(200);
    expect(res.getHeader("Content-Type")).toBe("text/html; charset=utf-8");
    expect(body).toContain("<title>Langfuse API Reference</title>");
    expect(body).toContain(
      'src="../vendor/scalar/scalar-api-reference-1.67.0.txt"',
    );
    expect(body).toContain('src="../vendor/scalar/langfuse-api-reference.js"');
    expect(body).not.toMatch(/https?:\/\//);
    expect(res.getHeader("Content-Security-Policy")).toBe(
      "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    );
  });

  it("keeps assets within a deployment base path", () => {
    const res = callHandler("GET");
    const body = res._getData() as string;
    const scriptUrls = [...body.matchAll(/src="([^"]+)"/g)].map(
      ([, url]) => url,
    );

    expect(scriptUrls).toHaveLength(2);
    expect(
      scriptUrls.map(
        (url) =>
          new URL(url!, "https://langfuse.example.com/langfuse/api/spec")
            .pathname,
      ),
    ).toEqual([
      "/langfuse/vendor/scalar/scalar-api-reference-1.67.0.txt",
      "/langfuse/vendor/scalar/langfuse-api-reference.js",
    ]);
  });

  it("keeps optional offline tools enabled while disabling online integrations", () => {
    const configuration = readFileSync(
      join(process.cwd(), "public/vendor/scalar/langfuse-api-reference.js"),
      "utf8",
    );

    expect(configuration).toContain('url: "../generated/api/openapi.yml"');
    expect(configuration).toContain("agent: { disabled: true }");
    expect(configuration).toContain("mcp: { disabled: true }");
    expect(configuration).toContain("telemetry: false");
    expect(configuration).toContain("withDefaultFonts: false");
    expect(configuration).not.toContain("hideClientButton");
    expect(configuration).not.toContain("hideTestRequestButton");
    expect(configuration).not.toMatch(/https?:\/\//);
  });

  it("pins the reviewed Scalar standalone bundle", () => {
    const bundle = readFileSync(
      join(
        process.cwd(),
        "public/vendor/scalar/scalar-api-reference-1.67.0.txt",
      ),
    );

    expect(createHash("sha384").update(bundle).digest("base64")).toBe(
      "K+6QKzDFun7NTjt/zWI+uFnjs8cJZ5dc2v5sKpm6Ftry+zYxcyZICFeqXqRAR3M7",
    );
    expect(bundle.toString()).not.toContain("https://fonts.scalar.com");

    const fontUrls = [
      ...new Set(
        bundle
          .toString()
          .match(/\.\.\/vendor\/scalar\/fonts\/[^)"']+\.woff2/g) ?? [],
      ),
    ];
    expect(fontUrls).toHaveLength(14);
    for (const fontUrl of fontUrls) {
      expect(() =>
        readFileSync(join(process.cwd(), "public", fontUrl.slice(3))),
      ).not.toThrow();
    }
  });

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
