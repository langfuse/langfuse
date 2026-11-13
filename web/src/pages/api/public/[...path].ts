import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { getProductBaseUrl } from "@/src/utils/base-url";
import { type NextApiRequest, type NextApiResponse } from "next";

const PUBLIC_API_DOCS_URL =
  "https://langfuse.com/docs/api-and-data-platform/features/public-api";

/**
 * JSON 404 for unknown `/api/public/*` paths.
 *
 * Next.js matches every concrete public API route before this catch-all, so it
 * only answers paths no route serves. API clients and coding agents get a
 * machine-readable error that points to the OpenAPI spec instead of the HTML
 * error page.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  await runMiddleware(req, res, cors);

  const openApiSpec = new URL("api/openapi.yaml", getProductBaseUrl()).href;
  const path = req.url?.split("?")[0] ?? "/api/public";

  return res.status(404).json({
    error: "NotFound",
    message: `No public API endpoint at ${req.method ?? "GET"} ${path}. See the OpenAPI spec for all endpoints: ${openApiSpec}`,
    openApiSpec,
    docs: PUBLIC_API_DOCS_URL,
  });
}
