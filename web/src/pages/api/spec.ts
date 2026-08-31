import { renderApiReference } from "@scalar/client-side-rendering";
import type { NextApiRequest, NextApiResponse } from "next";

const apiReferenceHtml = renderApiReference({
  pageTitle: "Langfuse API Reference",
  config: {
    url: "../../generated/api/openapi.yml",
  },
  cdn: "https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.67.0",
});

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

  if (req.method === "HEAD") {
    res.status(200).end();
    return;
  }

  res.status(200).send(apiReferenceHtml);
}
