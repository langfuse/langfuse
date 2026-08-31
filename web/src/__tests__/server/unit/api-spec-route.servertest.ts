import handler from "@/src/pages/api/spec";
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

describe("/api/spec", () => {
  it("renders the deployment-local specification with local assets", () => {
    const res = callHandler("GET");
    const body = res._getData() as string;

    expect(res.statusCode).toBe(200);
    expect(res.getHeader("Content-Type")).toBe("text/html; charset=utf-8");
    expect(body).toContain("<title>Langfuse API Reference</title>");
    expect(body).toContain('href="?asset=swagger-ui.css"');
    expect(body).toContain('src="?asset=swagger-ui-bundle.js"');
    expect(body).toContain('url: "../generated/api/openapi.yml"');
    expect(body).toContain("validatorUrl: null");
    expect(body).not.toMatch(/https?:\/\//);
  });

  it.each([
    ["swagger-ui.css", "text/css; charset=utf-8", ".swagger-ui"],
    [
      "swagger-ui-bundle.js",
      "text/javascript; charset=utf-8",
      "SwaggerUIBundle",
    ],
  ])("serves the packaged %s asset", (asset, contentType, content) => {
    const res = callHandler("GET", { asset });

    expect(res.statusCode).toBe(200);
    expect(res.getHeader("Content-Type")).toBe(contentType);
    expect(res.getHeader("Cache-Control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(res._getData()).toContain(content);
  });

  it("keeps the specification URL within a deployment base path", () => {
    const body = callHandler("GET")._getData() as string;
    const relativeSpecUrl = body.match(/url: "([^"]+)"/)?.[1];

    expect(relativeSpecUrl).toBe("../generated/api/openapi.yml");
    expect(
      new URL(
        relativeSpecUrl!,
        "https://langfuse.example.com/langfuse/api/spec",
      ).pathname,
    ).toBe("/langfuse/generated/api/openapi.yml");
  });

  it("rejects unknown assets", () => {
    expect(callHandler("GET", { asset: "unknown.js" }).statusCode).toBe(404);
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
