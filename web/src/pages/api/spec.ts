import { readFileSync } from "node:fs";
import { join } from "node:path";
import getSwaggerUiPath from "swagger-ui-dist/absolute-path.js";
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

const swaggerUiPath = getSwaggerUiPath();
const assets = {
  "swagger-ui-bundle.js": {
    content: readFileSync(join(swaggerUiPath, "swagger-ui-bundle.js")),
    contentType: "text/javascript; charset=utf-8",
  },
  "swagger-ui.css": {
    content: readFileSync(join(swaggerUiPath, "swagger-ui.css")),
    contentType: "text/css; charset=utf-8",
  },
} as const;

const apiReferenceHtml = `<!doctype html>
<html>
  <head>
    <title>Langfuse API Reference</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="?asset=swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="?asset=swagger-ui-bundle.js"></script>
    <script>
      SwaggerUIBundle({
        url: "../generated/api/openapi.yml",
        dom_id: "#swagger-ui",
        deepLinking: true,
        docExpansion: "none",
        persistAuthorization: false,
        validatorUrl: null,
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
