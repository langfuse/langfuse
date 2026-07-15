import { IN_APP_AGENT_MCP_TOOL_OVERRIDE_HEADER } from "@/src/ee/features/in-app-agent/constants";
import {
  createInAppAgentMcpRunOverride,
  InAppAgentMcpRunOverrideSchema,
} from "@/src/ee/features/in-app-agent/server/human-in-the-loop";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import {
  RateLimitHelper,
  RateLimitService,
} from "@/src/features/public-api/server/RateLimitService";
import handler, { getInAppAgentContext } from "@/src/pages/api/public/mcp";
import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";

describe("MCP route HTTP methods", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 405 for authenticated GET requests after rate limiting", async () => {
    const verifyAuth = vi
      .spyOn(ApiAuthService.prototype, "verifyAuthHeaderAndReturnScope")
      .mockResolvedValue({
        validKey: true,
        scope: {
          projectId: "project-1",
          orgId: "org-1",
          plan: "cloud:hobby",
          accessLevel: "project",
          rateLimitOverrides: [],
          apiKeyId: "api-key-1",
          publicKey: "pk-test",
          isIngestionSuspended: false,
          isInAppAgentKey: false,
        },
      });
    const rateLimit = vi
      .spyOn(RateLimitService.getInstance(), "rateLimitRequest")
      .mockResolvedValue(new RateLimitHelper(undefined));
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      headers: {
        host: "localhost:3000",
        authorization: "Basic test",
      },
    });

    await handler(req, res);

    expect(verifyAuth).toHaveBeenCalledOnce();
    expect(rateLimit).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(405);
    expect(res.getHeader("Allow")).toBe("POST, OPTIONS");
    expect(res._isEndCalled()).toBe(true);
  });
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
