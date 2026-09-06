import { beforeEach, describe, expect, it, vi } from "vitest";

const { getProjectV4MigrationData } = vi.hoisted(() => ({
  getProjectV4MigrationData: vi.fn(),
}));

vi.mock("@/src/features/v4/server/v4TransitionService", () => ({
  getProjectV4MigrationData,
}));

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {},
}));

import {
  getV4MigrationDataTool,
  handleGetV4MigrationData,
} from "@/src/features/mcp/server/v4Migration/tools/getV4MigrationData";
import { mockServerContext } from "@/src/__tests__/server/mcp-helpers";

describe("getV4MigrationData MCP tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the project-scoped data exposed by the v4 migration API", async () => {
    const migrationData = {
      projectId: "project-1",
      forceV3Experience: false,
      sdkUsage: {
        projectId: "project-1",
        experimentInstrumentationMigration: {
          status: "not_required",
          upgradePath: null,
        },
        sdkUsageSeries: [
          {
            sdkName: "langfuse-python",
            sdkVersion: "3.10.0",
            actionLevel: "required",
          },
        ],
      },
      legacyIntegrations: {
        projectId: "project-1",
        legacyIntegrationCount: 1,
        legacyIntegrations: {
          posthog: true,
          mixpanel: false,
          blobStorage: false,
        },
      },
      legacyApiUsage: [
        {
          projectId: "project-1",
          entrypoint: "publicapi: GET /api/public/traces",
          count: 4,
          lastSeen: "2026-08-26T12:00:00.000Z",
        },
      ],
      traceLevelEvals: {
        projectId: "project-1",
        traceLevelEvalCount: 2,
      },
    };
    getProjectV4MigrationData.mockResolvedValue(migrationData);
    const context = mockServerContext({ projectId: "project-1" });

    await expect(handleGetV4MigrationData({}, context)).resolves.toEqual(
      migrationData,
    );
    expect(getProjectV4MigrationData).toHaveBeenCalledWith({
      prisma: expect.anything(),
      projectId: "project-1",
    });
  });

  it("is discoverable as a read-only, expensive tool without project input", () => {
    expect(getV4MigrationDataTool).toMatchObject({
      name: "getV4MigrationData",
      annotations: {
        readOnlyHint: true,
        expensiveHint: true,
      },
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    });
  });
});
