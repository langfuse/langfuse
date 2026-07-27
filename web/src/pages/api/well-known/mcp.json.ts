import { type NextApiRequest, type NextApiResponse } from "next";
import { getProductBaseUrl } from "@/src/utils/base-url";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).end("Method Not Allowed");
    return;
  }
  const baseUrl = getProductBaseUrl();
  const payload = {
    $schema:
      "https://static.modelcontextprotocol.io/schemas/2025-10-17/server.schema.json",
    title: "Langfuse",
    description: "Use Langfuse over MCP.",
    websiteUrl: "https://langfuse.com",
    repository: {
      url: "https://github.com/langfuse/langfuse",
      source: "github",
    },
    remotes: [
      {
        type: "streamable-http",
        url: new URL("api/public/mcp", baseUrl).toString(),
      },
    ],
  };

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(200).send(`${JSON.stringify(payload, null, 2)}\n`);
}
