import type { NextApiRequest, NextApiResponse } from "next";

const contentSecurityPolicy = [
  "default-src 'none'",
  "script-src 'unsafe-inline' https://cdn.jsdelivr.net",
  "style-src 'unsafe-inline' https://cdn.jsdelivr.net",
  "img-src https: data: blob:",
  "font-src https://cdn.jsdelivr.net data:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

const apiReferenceHtml = `<!doctype html>
<html>
  <head>
    <title>Langfuse API Reference</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <div id="app"></div>
    <script
      src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.67.0"
      integrity="sha384-zH522fC6a57bnP3yLzTekKbq61WR1WnYu4dxusbB48q1eska2wE6/qmqHAHEkv+H"
      crossorigin="anonymous"></script>
    <script>
      Scalar.createApiReference("#app", {
        url: "../generated/api/openapi.yml",
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

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.setHeader("Content-Security-Policy", contentSecurityPolicy);

  if (req.method === "HEAD") {
    res.status(200).end();
    return;
  }

  res.status(200).send(apiReferenceHtml);
}
