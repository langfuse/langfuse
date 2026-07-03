import { IN_APP_AGENT_MCP_TOOL_OVERRIDE_HEADER } from "@/src/ee/features/in-app-agent/constants";
import {
  createInAppAgentMcpRunOverride,
  InAppAgentMcpRunOverrideSchema,
} from "@/src/ee/features/in-app-agent/server/human-in-the-loop";
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
