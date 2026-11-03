import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isTopicsProjectEnabled: vi.fn(),
  listPublicTopicFacets: vi.fn(),
  listPublicTopics: vi.fn(),
  listPublicTopicSummaries: vi.fn(),
}));

vi.mock("@langfuse/shared/topics/server", () => ({
  isTopicsProjectEnabled: mocks.isTopicsProjectEnabled,
}));
vi.mock("@/src/features/topics/server/publicApi", () => ({
  listPublicTopicFacets: mocks.listPublicTopicFacets,
  listPublicTopics: mocks.listPublicTopics,
  listPublicTopicSummaries: mocks.listPublicTopicSummaries,
}));

import {
  createInAppAgentToolPolicy,
  IN_APP_AGENT_LANGFUSE_MCP_TOOL_POLICIES,
} from "@langfuse/shared/in-app-agent/server/mcpPolicy";
import { topicsFeature } from "@/src/features/mcp/server/topics";
import {
  handleListTopicSummaries,
  handleListTopics,
} from "@/src/features/mcp/server/topics/tools";
import { encodeTopicResultCursor } from "@/src/features/public-api/types/unstable-topics";
import { createStructuredPublicApiError } from "@/src/features/public-api/types/structuredPublicApiError";
import { mockServerContext } from "@/src/__tests__/server/mcp-helpers";

const context = mockServerContext({ projectId: "project-1" });
/** Handlers validate raw MCP arguments, so tests pass them untyped. */
const raw = (input: unknown) => input as never;

describe("Topics MCP tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listPublicTopicSummaries.mockResolvedValue({
      window: { from: new Date(), to: new Date() },
      data: [],
      meta: { cursor: null },
    });
  });

  it("is enabled only for Topics projects and auto-approved read-only for the in-app agent when the user can view Topics", async () => {
    mocks.isTopicsProjectEnabled.mockReturnValue(false);
    expect(await topicsFeature.isEnabled(context)).toBe(false);
    mocks.isTopicsProjectEnabled.mockReturnValue(true);
    expect(await topicsFeature.isEnabled(context)).toBe(true);
    expect(mocks.isTopicsProjectEnabled).toHaveBeenCalledWith("project-1");

    const viewer = { projectRole: "VIEWER", isAdmin: false } as const;
    const withTopics = createInAppAgentToolPolicy({
      userAccess: { ...viewer, topicsAvailable: true },
    });
    const withoutTopics = createInAppAgentToolPolicy({ userAccess: viewer });
    for (const { definition } of topicsFeature.tools) {
      expect(definition.annotations?.readOnlyHint).toBe(true);
      expect(IN_APP_AGENT_LANGFUSE_MCP_TOOL_POLICIES[definition.name]).toEqual({
        approval: "auto",
        availability: { scope: "topics:read" },
      });
      expect([...withTopics.autoApproved]).toContain(definition.name);
      expect([...withoutTopics.available]).not.toContain(definition.name);
    }
  });

  it("reads summaries of specific traces with agent-sized defaults", async () => {
    const timestamp = new Date("2026-10-19T10:00:00.000Z");
    const filter = [
      {
        type: "stringOptions",
        column: "traceId",
        operator: "any of",
        value: ["t1", "t2"],
      },
    ];

    await handleListTopicSummaries(
      raw({
        filter,
        fromTimestamp: "2026-10-13T00:00:00.000Z",
        cursor: encodeTopicResultCursor({
          timestamp,
          traceId: "t1",
          facetId: "issues",
        }),
      }),
      context,
    );

    expect(mocks.listPublicTopicSummaries).toHaveBeenCalledWith({
      projectId: "project-1",
      plan: "oss",
      fromTimestamp: new Date("2026-10-13T00:00:00.000Z"),
      filter,
      truncateSummaries: true,
      orderBy: "timestamp.desc",
      limit: 20,
      cursor: { v: 1, timestamp, traceId: "t1", facetId: "issues" },
    });
    await expect(
      handleListTopicSummaries(raw({ limit: 101 }), context),
    ).rejects.toThrow();
  });

  it("lists allowed values in filter errors", async () => {
    mocks.listPublicTopics.mockRejectedValue(
      createStructuredPublicApiError({
        httpCode: 400,
        code: "invalid_query",
        message: 'Unknown filter column "tags".',
        details: { column: "tags", allowedValues: ["facetId", "name"] },
      }),
    );

    await expect(handleListTopics(raw({}), context)).rejects.toThrow(
      'Unknown filter column "tags". Allowed: facetId, name.',
    );
  });
});
