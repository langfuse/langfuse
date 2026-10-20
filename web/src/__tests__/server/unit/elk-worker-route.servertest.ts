import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";

import handler from "@/src/pages/api/workers/elk-worker";

const requireFrom = createRequire(import.meta.url);
const elkWorkerFile = join(
  dirname(requireFrom.resolve("elkjs/package.json")),
  "lib/elk-worker.min.js",
);

const callHandler = (
  method: "GET" | "HEAD" | "POST",
  headers: Record<string, string> = {},
) => {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method,
    headers,
  });
  handler(req, res);
  return res;
};

/**
 * The trace graph's layout worker is served from this route rather than from a
 * bundler chunk. Worker chunks live under `/_next/static/chunks/...` on the app
 * origin, which only ever serves the current build, so every tab that outlives
 * a deploy 404s on its worker and silently loses the large-graph layout budget
 * (Sentry LANGFUSE-5YT / -57K, ~590 events / 14d). This path carries no content
 * hash, so it keeps resolving.
 */
describe("/api/workers/elk-worker", () => {
  it("serves elkjs's own prebuilt worker, byte for byte", () => {
    const res = callHandler("GET");

    expect(res.statusCode).toBe(200);
    expect(res.getHeader("Content-Type")).toBe(
      "text/javascript; charset=utf-8",
    );
    const served = res._getData() as Buffer;
    expect(served.equals(readFileSync(elkWorkerFile))).toBe(true);
  });

  it("serves a worker that fetches nothing", () => {
    // Why elkjs's prebuilt file can be served as-is instead of bundled: it has
    // no loader of its own, so there is nothing left under it to 404.
    const source = (callHandler("GET")._getData() as Buffer).toString("utf8");

    expect(source).not.toContain("importScripts(");
    expect(source).not.toContain("require(");
    expect(source).toContain("onmessage");
  });

  it("is cacheable and revalidates with an ETag", () => {
    const res = callHandler("GET");
    const etag = res.getHeader("ETag");

    expect(res.getHeader("Cache-Control")).toBe("public, max-age=86400");
    expect(etag).toMatch(/^"[a-f0-9]{32}"$/);

    const revalidated = callHandler("GET", { "if-none-match": String(etag) });
    expect(revalidated.statusCode).toBe(304);
    expect(revalidated._getData()).toBe("");
  });

  it("answers HEAD without a body", () => {
    const res = callHandler("HEAD");

    expect(res.statusCode).toBe(200);
    expect(res.getHeader("Content-Type")).toBe(
      "text/javascript; charset=utf-8",
    );
    expect(res._getData()).toBe("");
  });

  it("rejects anything that is not a read", () => {
    const res = callHandler("POST");

    expect(res.statusCode).toBe(405);
    expect(res.getHeader("Allow")).toBe("GET, HEAD");
  });
});
