// @vitest-environment node

import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import type { Session } from "next-auth";
import { describe, expect, it, vi } from "vitest";
import { TRACE_STARTER } from "../types";
import { customVisualizationRouter } from "./customVisualizationRouter";

vi.mock("@/src/features/posthog-analytics/server/backendActivity", () => ({
  recordBackendActivity: vi.fn(async () => undefined),
}));

const projectId = "custom-ui-access-project";

function createCaller({
  admin,
  customUi,
}: {
  admin: boolean;
  customUi: boolean;
}) {
  const session = {
    expires: "1",
    user: {
      id: "custom-ui-access-user",
      admin,
      featureFlags: testFeatureFlags({ customUi }),
      organizations: [
        {
          id: "custom-ui-access-org",
          role: "OWNER",
          projects: [{ id: projectId, role: "OWNER" }],
        },
      ],
    },
  } as Session;

  return customVisualizationRouter.createCaller(
    createInnerTRPCContext({ session, headers: {} }),
  );
}

describe("customVisualizationRouter access", () => {
  it.each([
    { admin: false, customUi: true, boundary: "platform admin" },
    { admin: true, customUi: false, boundary: "personal preview opt-in" },
  ])(
    "rejects every procedure without the $boundary boundary",
    async ({ admin, customUi }) => {
      const caller = createCaller({ admin, customUi });
      const calls = [
        () => caller.generationModel({ projectId }),
        () => caller.list({ projectId }),
        () => caller.active({ projectId }),
        () => caller.saveVersion({ projectId, definition: TRACE_STARTER }),
        () =>
          caller.generateVersion({
            projectId,
            prompt: "Create a useful Custom UI",
            currentDefinition: TRACE_STARTER,
          }),
        () =>
          caller.publishVersion({
            projectId,
            visualizationId: "visualization-id",
            versionId: "version-id",
          }),
      ];

      for (const call of calls) {
        await expect(call()).rejects.toMatchObject({ code: "NOT_FOUND" });
      }
    },
  );

  it("allows an opted-in platform admin through the preview gate", async () => {
    await expect(
      createCaller({ admin: true, customUi: true }).generationModel({
        projectId,
      }),
    ).resolves.toBeDefined();
  });
});
