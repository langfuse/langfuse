import handler from "@/src/pages/api/public/[...path]";
import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";

vi.mock("@/src/utils/base-url", () => ({
  getProductBaseUrl: () => new URL("https://langfuse.example.com/langfuse/"),
}));

describe("/api/public/[...path]", () => {
  it("answers unknown public API paths with a JSON 404 that points to the spec", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      url: "/api/public/v2/score-configs?limit=10",
    });

    await handler(req, res);

    expect(res.statusCode).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: "NotFound",
      message:
        "No public API endpoint at GET /api/public/v2/score-configs. See the OpenAPI spec for all endpoints: https://langfuse.example.com/langfuse/api/openapi.yaml",
      openApiSpec: "https://langfuse.example.com/langfuse/api/openapi.yaml",
      docs: "https://langfuse.com/docs/api-and-data-platform/features/public-api",
    });
  });
});
