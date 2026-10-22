import { IN_APP_AGENT_MCP_TOOL_OVERRIDE_HEADER } from "@langfuse/shared/in-app-agent";
import { createInAppAgentMcpRunOverride } from "@langfuse/shared/in-app-agent/server/mcpPolicy";
import { getInAppAgentContext } from "@/src/pages/api/public/mcp";
import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";

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

  it("returns the tool allowlist for valid override headers", async () => {
    const overrideHeader = await createInAppAgentMcpRunOverride({
      toolNames: ["upsertDataset", "createDashboardWidget"],
    });
    const req = createRequest(overrideHeader);

    expect(getInAppAgentContext(req, true)).toEqual({
      permissions: "tool-allowlist",
      allowedToolNames: ["upsertDataset", "createDashboardWidget"],
    });
  });

  it("rejects unsigned plain JSON headers and defaults to read permissions", () => {
    const singleToolReq = createRequest('{"toolName":"upsertDataset"}');
    const allowlistReq = createRequest('{"toolNames":["upsertDataset"]}');

    expect(getInAppAgentContext(singleToolReq, true)).toEqual({
      permissions: "read",
    });
    expect(getInAppAgentContext(allowlistReq, true)).toEqual({
      permissions: "read",
    });
  });

  it("rejects tampered override tokens", async () => {
    const validHeader = await createInAppAgentMcpRunOverride({
      toolNames: ["upsertDataset"],
    });
    const tamperedReq = createRequest(validHeader + "tampered");

    expect(getInAppAgentContext(tamperedReq, true)).toEqual({
      permissions: "read",
    });
  });

  it("still resolves a signed single-tool header", async () => {
    const overrideHeader = await createInAppAgentMcpRunOverride({
      toolNames: ["upsertDataset"],
    });
    const req = createRequest(overrideHeader);

    expect(getInAppAgentContext(req, true)).toEqual({
      permissions: "tool-allowlist",
      allowedToolNames: ["upsertDataset"],
    });
  });
});
