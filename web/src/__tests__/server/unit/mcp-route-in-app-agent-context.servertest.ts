import { IN_APP_AGENT_MCP_REQUEST_METADATA_HEADER } from "@/src/ee/features/in-app-agent/constants";
import {
  createInAppAgentMcpRequestMetadata,
  InAppAgentMcpRequestMetadataSchema,
} from "@/src/ee/features/in-app-agent/server/human-in-the-loop";
import {
  getInAppAgentContext,
  getInAppAgentRequestMetadata,
} from "@/src/pages/api/public/mcp";
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
              [IN_APP_AGENT_MCP_REQUEST_METADATA_HEADER]: overrideHeader,
            },
    });

    return req;
  };

  it("returns undefined for non in-app-agent keys", () => {
    const req = createRequest(
      '{"permissions":"single-tool-override","actingOnBehalfOfUserId":"user-1","allowedToolName":"upsertDataset"}',
    );

    expect(getInAppAgentContext(req, false)).toBeUndefined();
    expect(getInAppAgentContext(req, undefined)).toBeUndefined();
    expect(getInAppAgentRequestMetadata(req, false)).toBeUndefined();
  });

  it("fails when in-app-agent metadata is missing", () => {
    const req = createRequest();

    expect(() => getInAppAgentContext(req, true)).toThrow(
      "In-app agent MCP requests must include request metadata.",
    );
  });

  it("fails for malformed metadata headers", () => {
    const malformedJsonReq = createRequest("not-json");
    const invalidToolReq = createRequest(
      '{"permissions":"single-tool-override","actingOnBehalfOfUserId":"user-1","allowedToolName":"notAMcpTool"}',
    );

    expect(() => getInAppAgentContext(malformedJsonReq, true)).toThrow(
      "Invalid in-app agent MCP request metadata.",
    );
    expect(() => getInAppAgentContext(invalidToolReq, true)).toThrow(
      "Invalid in-app agent MCP request metadata.",
    );
  });

  it("returns user metadata for read-only in-app-agent requests", async () => {
    const metadataHeader = createInAppAgentMcpRequestMetadata({
      permissions: "read",
      actingOnBehalfOfUserId: "user-1",
    });
    const req = createRequest(metadataHeader);

    expect(
      InAppAgentMcpRequestMetadataSchema.parse(JSON.parse(metadataHeader)),
    ).toEqual({
      permissions: "read",
      actingOnBehalfOfUserId: "user-1",
    });
    expect(getInAppAgentRequestMetadata(req, true)).toEqual({
      inAppAgent: {
        actingOnBehalfOfUserId: "user-1",
        permissions: "read",
      },
    });
    expect(getInAppAgentContext(req, true)).toEqual({
      actingOnBehalfOfUserId: "user-1",
      permissions: "read",
    });
  });

  it("returns a single-tool override for valid metadata headers", async () => {
    const overrideHeader = createInAppAgentMcpRequestMetadata({
      permissions: "single-tool-override",
      actingOnBehalfOfUserId: "user-1",
      allowedToolName: "upsertDataset",
    });
    const req = createRequest(overrideHeader);

    expect(
      InAppAgentMcpRequestMetadataSchema.parse(JSON.parse(overrideHeader)),
    ).toEqual({
      permissions: "single-tool-override",
      actingOnBehalfOfUserId: "user-1",
      allowedToolName: "upsertDataset",
    });
    expect(getInAppAgentRequestMetadata(req, true)).toEqual({
      inAppAgent: {
        actingOnBehalfOfUserId: "user-1",
        permissions: "single-tool-override",
        allowedToolName: "upsertDataset",
      },
    });
    expect(getInAppAgentContext(req, true)).toEqual({
      actingOnBehalfOfUserId: "user-1",
      permissions: "single-tool-override",
      allowedToolName: "upsertDataset",
    });
  });
});
