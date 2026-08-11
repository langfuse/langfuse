import { IN_APP_AGENT_MCP_TOOL_OVERRIDE_HEADER } from "@langfuse/shared/in-app-agent";
import {
  createInAppAgentMcpRunOverride,
  InAppAgentMcpRunOverrideSchema,
} from "@langfuse/shared/in-app-agent/server/human-in-the-loop";
import {
  applyMcpPublicApiRateLimit,
  getInAppAgentContext,
} from "@/src/pages/api/public/mcp";
import { RateLimitService } from "@/src/features/public-api/server/RateLimitService";
import type { ApiAccessScope } from "@langfuse/shared/src/server";
import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";

const createApiAccessScope = (isInAppAgentKey: boolean): ApiAccessScope => ({
  projectId: "project-id",
  orgId: "org-id",
  apiKeyId: "api-key-id",
  publicKey: "pk-lf-test",
  accessLevel: "project",
  plan: "oss",
  rateLimitOverrides: [],
  isIngestionSuspended: false,
  isInAppAgentKey,
});

describe("MCP route in-app-agent context", () => {
  const createRequest = (overrideHeader?: string) => {
    const { req } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      headers:
        overrideHeader === undefined
          ? {}
          : {
              [IN_APP_AGENT_MCP_TOOL_OVERRIDE_HEADER]: overrideHeader,
            },
    });

    return req;
  };

  it("returns undefined for non in-app-agent keys", () => {
    const req = createRequest('{"toolName":"upsertDataset"}');

    expect(getInAppAgentContext(req, false)).toBeUndefined();
    expect(getInAppAgentContext(req, undefined)).toBeUndefined();
  });

  it("defaults to read permissions when no override header is present", () => {
    const req = createRequest();

    expect(getInAppAgentContext(req, true)).toEqual({ permissions: "read" });
  });

  it("falls back to read permissions for malformed override headers", () => {
    const malformedJsonReq = createRequest("not-json");
    const invalidToolReq = createRequest('{"toolName":"notAMcpTool"}');

    expect(getInAppAgentContext(malformedJsonReq, true)).toEqual({
      permissions: "read",
    });
    expect(getInAppAgentContext(invalidToolReq, true)).toEqual({
      permissions: "read",
    });
  });

  it("returns a single-tool override for valid override headers", async () => {
    const overrideHeader = await createInAppAgentMcpRunOverride({
      toolName: "upsertDataset",
    });
    const req = createRequest(overrideHeader);

    expect(
      InAppAgentMcpRunOverrideSchema.parse(JSON.parse(overrideHeader)),
    ).toEqual({
      toolName: "upsertDataset",
    });
    expect(getInAppAgentContext(req, true)).toEqual({
      permissions: "single-tool-override",
      allowedToolName: "upsertDataset",
    });
  });
});

describe("MCP route public API rate limiting", () => {
  const rateLimitRequest = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    rateLimitRequest.mockReset();
    vi.spyOn(RateLimitService, "getInstance").mockReturnValue({
      rateLimitRequest,
    } as unknown as RateLimitService);
  });

  it("exempts authenticated in-app-agent keys", async () => {
    const { res } = createMocks<NextApiRequest, NextApiResponse>();

    const responseSent = await applyMcpPublicApiRateLimit(
      createApiAccessScope(true),
      res,
    );

    expect(responseSent).toBe(false);
    expect(rateLimitRequest).not.toHaveBeenCalled();
  });

  it("rate limits normal keys based only on authenticated scope", async () => {
    const { res } = createMocks<NextApiRequest, NextApiResponse>();
    const sendRestResponseIfLimited = vi.fn((response: NextApiResponse) =>
      response.status(429).end(),
    );
    rateLimitRequest.mockResolvedValue({
      isRateLimited: () => true,
      sendRestResponseIfLimited,
    });

    const responseSent = await applyMcpPublicApiRateLimit(
      createApiAccessScope(false),
      res,
    );

    expect(responseSent).toBe(true);
    expect(rateLimitRequest).toHaveBeenCalledWith(
      createApiAccessScope(false),
      "public-api",
    );
    expect(sendRestResponseIfLimited).toHaveBeenCalledWith(res);
    expect(res.statusCode).toBe(429);
  });
});
