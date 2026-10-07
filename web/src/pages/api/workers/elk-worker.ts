import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { NextApiRequest, NextApiResponse } from "next";

/**
 * Serve elkjs's prebuilt layout worker from a URL that survives a deploy.
 *
 * The trace graph used to start this worker from a Turbopack chunk under
 * `/_next/static/chunks/...`. Worker entrypoints and their chunks are pinned to
 * the app origin on purpose (browsers reject a cross-origin classic worker), and
 * the app origin only ever serves the current build — so in any tab that
 * outlives a deploy the worker 404s and the graph silently drops to the much
 * smaller main-thread layout budget.
 *
 * This path is not content-hashed, so it keeps resolving across deploys: the
 * build in front of it always has an elkjs to serve. `elk-worker.min.js` is
 * genuinely standalone (no `importScripts`, no `require`, it installs its own
 * `self.onmessage`), which is what makes serving the dependency's own file
 * possible instead of bundling it.
 *
 * Reading a prebuilt dependency bundle off disk and serving it from an API route
 * is the same shape as `/api/docs`; `outputFileTracingIncludes` in
 * `next.config.mjs` keeps the file in the standalone output.
 */
const elkWorkerPath = [
  join(process.cwd(), "node_modules/elkjs/lib/elk-worker.min.js"),
  join(process.cwd(), "web/node_modules/elkjs/lib/elk-worker.min.js"),
].find(existsSync);

if (!elkWorkerPath) {
  throw new Error("elkjs worker bundle is missing");
}

const elkWorker = readFileSync(elkWorkerPath);
const elkWorkerETag = `"${createHash("sha256")
  .update(elkWorker)
  .digest("hex")
  .slice(0, 32)}"`;

/**
 * A day. The file only changes when elkjs is upgraded, and a tab holding the
 * previous one is fine: elk-api's message protocol is what both sides speak,
 * and it is stable across elkjs releases. Revalidation after that is a 304.
 */
const MAX_AGE_SECONDS = 86_400;

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse,
): void {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    res.status(405).end();
    return;
  }

  res.setHeader("Content-Type", "text/javascript; charset=utf-8");
  res.setHeader("Cache-Control", `public, max-age=${MAX_AGE_SECONDS}`);
  res.setHeader("ETag", elkWorkerETag);

  if (req.headers["if-none-match"] === elkWorkerETag) {
    res.status(304).end();
    return;
  }

  res.status(200);
  req.method === "HEAD" ? res.end() : res.send(elkWorker);
}
