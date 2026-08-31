import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { NextApiRequest, NextApiResponse } from "next";

const contentSecurityPolicy = [
  "default-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

const scalarBundlePath = [
  join(
    process.cwd(),
    "node_modules/@scalar/api-reference/dist/browser/standalone.js",
  ),
  join(
    process.cwd(),
    "web/node_modules/@scalar/api-reference/dist/browser/standalone.js",
  ),
].find(existsSync);

if (!scalarBundlePath) {
  throw new Error("Scalar API reference bundle is missing");
}

const assets = {
  "scalar-api-reference.js": {
    content: readFileSync(scalarBundlePath),
    contentType: "text/javascript; charset=utf-8",
  },
} as const;

const apiReferenceHtml = `<!doctype html>
<html>
  <head>
    <title>Langfuse API Reference</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <div id="app"></div>
    <script src="?asset=scalar-api-reference.js"></script>
    <script>
      Scalar.createApiReference("#app", {
        url: "../generated/api/openapi.yml",
        agent: { disabled: true },
        mcp: { disabled: true },
        telemetry: false,
        hideClientButton: true,
        withDefaultFonts: false,
        customCss: \`
          :root {
            --scalar-font: ui-sans-serif, system-ui, sans-serif;
            --scalar-font-code: ui-monospace, monospace;
          }
        \`,
      });
    </script>
  </body>
</html>`;

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse,
): void {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    res.status(405).end();
    return;
  }

  const assetName =
    typeof req.query.asset === "string" ? req.query.asset : null;
  if (assetName) {
    const asset = assets[assetName as keyof typeof assets];
    if (!asset) {
      res.status(404).end();
      return;
    }

    res.setHeader("Content-Type", asset.contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.status(200);
    req.method === "HEAD" ? res.end() : res.send(asset.content);
    return;
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.setHeader("Content-Security-Policy", contentSecurityPolicy);
  res.status(200);
  req.method === "HEAD" ? res.end() : res.send(apiReferenceHtml);
}
