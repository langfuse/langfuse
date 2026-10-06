import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Session } from "next-auth";
import type * as SharedServer from "@langfuse/shared/src/server";
import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { eventsRouter } from "@/src/features/events/server/eventsRouter";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { env } from "@/src/env.mjs";
import {
  getFeaturePreviewOptOutFlag,
  parseFlagsWithOrganizationDefaults,
} from "@/src/features/feature-flags/server";

const mocks = vi.hoisted(() => ({
  loadTraceTranscript: vi.fn(async () => ({ threads: [] })),
}));

vi.mock("@/src/features/events/server/loadTraceTranscript", () => ({
  loadTraceTranscript: mocks.loadTraceTranscript,
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal<typeof SharedServer>()),
  getTraceByIdFromEventsTable: vi.fn(async () => ({
    id: "trace-id",
    projectId: "project-id",
    timestamp: new Date("2026-01-01"),
    public: false,
    sessionId: null,
    input: null,
    output: null,
  })),
}));

describe("events.transcriptByTraceId preview access", () => {
  const originalExperimentalFeatures =
    env.LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES;
  const originalWriteMode = env.LANGFUSE_MIGRATION_V4_WRITE_MODE;
  beforeEach(() => {
    mocks.loadTraceTranscript.mockClear();
    Object.assign(env, {
      LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES: "false",
      LANGFUSE_MIGRATION_V4_WRITE_MODE: "events_only",
    });
  });

  afterEach(() => {
    Object.assign(env, {
      LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES: originalExperimentalFeatures,
      LANGFUSE_MIGRATION_V4_WRITE_MODE: originalWriteMode,
    });
  });

  it.each([
    {
      name: "user preview",
      flags: ["modernSession", "sessionTimeline"],
      defaults: [],
      allowed: true,
    },
    { name: "disabled preview", flags: [], defaults: [], allowed: false },
    {
      name: "organization default",
      flags: [],
      defaults: ["modernSession", "sessionTimeline"],
      allowed: true,
    },
    {
      name: "user opt-out",
      flags: [getFeaturePreviewOptOutFlag("sessionTimeline")],
      defaults: ["modernSession", "sessionTimeline"],
      allowed: false,
    },
  ])("respects $name", async ({ flags, defaults, allowed }) => {
    const session = {
      expires: "1",
      user: {
        id: "user-id",
        name: "Test User",
        admin: false,
        canCreateOrganizations: true,
        featureFlags: testFeatureFlags(),
        organizations: [
          {
            id: "org-id",
            name: "Test Organization",
            role: "MEMBER",
            plan: "cloud:hobby",
            cloudConfig: undefined,
            metadata: {},
            aiFeaturesEnabled: false,
            aiTelemetryEnabled: false,
            featureFlags: parseFlagsWithOrganizationDefaults(flags, defaults, {
              email: "user@example.com",
              v4BetaEnabled: true,
            }),
            projects: [
              {
                id: "project-id",
                name: "Test Project",
                role: "MEMBER",
                retentionDays: 30,
                deletedAt: null,
                hasTraces: false,
                metadata: {},
                createdAt: new Date().toISOString(),
              },
            ],
          },
        ],
      },
      environment: {
        enableExperimentalFeatures: false,
        selfHostedInstancePlan: null,
      },
    } satisfies Session;
    const caller = eventsRouter.createCaller(
      createInnerTRPCContext({ session, headers: {} }),
    );
    const result = caller.transcriptByTraceId({
      projectId: "project-id",
      traceId: "trace-id",
    });
    if (!allowed) {
      await expect(result).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(mocks.loadTraceTranscript).not.toHaveBeenCalled();
      return;
    }
    await expect(result).resolves.toEqual({ threads: [] });
    expect(mocks.loadTraceTranscript).toHaveBeenCalledOnce();
  });
});
