import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as SharedServer from "@langfuse/shared/src/server";
import type * as TopicsServer from "@langfuse/shared/topics/server";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { env } from "@/src/env.mjs";
import {
  getFeaturePreviewOptOutFlag,
  parseFlagsWithOrganizationDefaults,
} from "@/src/features/feature-flags/utils";
import { createSession } from "@/src/__tests__/fixtures/session-factory";

const mocks = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "EU";
  process.env.LANGFUSE_TRACE_EVALS_ENABLED_PROJECT_IDS = "listed-project-id";
  return {
    getObservationsForTraceFromEventsTable: vi.fn(async () => ({
      observations: [],
      totalCount: 0,
    })),
    loadTopicTranscript: vi.fn(),
  };
});

vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal<typeof SharedServer>()),
  getObservationsForTraceFromEventsTable:
    mocks.getObservationsForTraceFromEventsTable,
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

vi.mock("@langfuse/shared/topics/server", async (importOriginal) => ({
  ...(await importOriginal<typeof TopicsServer>()),
  loadTopicTranscript: mocks.loadTopicTranscript,
}));

function createCaller({
  email,
  flags,
  defaults,
}: {
  email: string;
  flags: string[];
  defaults: string[];
}) {
  const session = createSession({
    user: { id: "user-id", name: "Test User", email },
    organizations: [
      {
        id: "org-id",
        role: "MEMBER",
        featureFlags: parseFlagsWithOrganizationDefaults(flags, defaults, {
          v4BetaEnabled: true,
        }),
        projects: [
          { id: "project-id" },
          { id: "listed-project-id" },
          { id: "unlisted-project-id" },
        ],
      },
    ],
  });
  return appRouter.createCaller(
    createInnerTRPCContext({ session, headers: {} }),
  );
}

describe("events transcript access", () => {
  const originalExperimentalFeatures =
    env.LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES;
  const originalWriteMode = env.LANGFUSE_MIGRATION_V4_WRITE_MODE;
  beforeEach(() => {
    mocks.getObservationsForTraceFromEventsTable.mockClear();
    mocks.loadTopicTranscript.mockReset();
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
      flags: ["sessionViewV2", "sessionViewV2Timeline"],
      defaults: [],
      allowed: true,
    },
    { name: "default preview", flags: [], defaults: [], allowed: true },
    {
      name: "organization default",
      flags: [],
      defaults: ["sessionViewV2", "sessionViewV2Timeline"],
      allowed: true,
    },
    {
      name: "external user opt-out",
      email: "user@example.com",
      flags: [getFeaturePreviewOptOutFlag("sessionViewV2Timeline")],
      defaults: ["sessionViewV2", "sessionViewV2Timeline"],
      allowed: false,
    },
    {
      name: "staff access without the timeline preview",
      email: "member@clickhouse.com",
      flags: [getFeaturePreviewOptOutFlag("sessionViewV2Timeline")],
      defaults: [],
      allowed: true,
    },
  ])("transcriptByTraceId respects $name", async (testCase) => {
    const { flags, defaults, allowed, email = "user@example.com" } = testCase;
    const result = createCaller({
      email,
      flags,
      defaults,
    }).events.transcriptByTraceId({
      context: "session",
      projectId: "project-id",
      traceId: "trace-id",
    });
    if (!allowed) {
      await expect(result).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(
        mocks.getObservationsForTraceFromEventsTable,
      ).not.toHaveBeenCalled();
      return;
    }
    await expect(result).resolves.toEqual({
      transcript: null,
      cutoff: false,
    });
    expect(mocks.getObservationsForTraceFromEventsTable).toHaveBeenCalledTimes(
      2,
    );
  });

  it.each([
    {
      name: "a project on the trace evals list",
      projectId: "listed-project-id",
      allowed: true,
    },
    {
      name: "a project not on the trace evals list",
      projectId: "unlisted-project-id",
      allowed: false,
    },
  ])(
    "transcriptByTraceId lets the traceTranscriptEvals preview read $name",
    async ({ projectId, allowed }) => {
      const result = createCaller({
        email: "user@example.com",
        flags: [
          "traceTranscriptEvals",
          getFeaturePreviewOptOutFlag("sessionViewV2Timeline"),
        ],
        defaults: [],
      }).events.transcriptByTraceId({
        context: "session",
        projectId,
        traceId: "trace-id",
      });
      if (!allowed) {
        await expect(result).rejects.toMatchObject({ code: "FORBIDDEN" });
        return;
      }
      await expect(result).resolves.toEqual({
        transcript: null,
        cutoff: false,
      });
    },
  );

  it.each([
    { name: "external user", email: "user@example.com", allowed: false },
    { name: "staff", email: "member@clickhouse.com", allowed: true },
  ])(
    "topicsTranscriptByTraceId renders Topics text for $name only",
    async ({ email, allowed }) => {
      const at = new Date("2026-01-01T00:00:00.000Z");
      mocks.loadTopicTranscript.mockResolvedValue({
        transcript: {
          threads: [
            {
              conversationHistory: [],
              currentTurn: {
                nestingLevel: 0,
                observations: [{ id: "generation", traceId: "trace-id" }],
                messages: [
                  {
                    observationId: "generation",
                    traceId: "trace-id",
                    startTime: at,
                    endTime: at,
                    role: "user",
                    source: "input",
                    parts: [{ type: "text", text: "Run the tests" }],
                  },
                ],
              },
            },
          ],
        },
        executionIssues: [
          {
            observationId: "tool",
            traceId: "trace-id",
            type: "TOOL",
            name: "bash",
            level: "ERROR",
            statusMessage: "exit code 1",
            startTime: at,
          },
        ],
      });
      // The timeline preview grants trace transcripts, not Topics transcripts.
      const result = createCaller({
        email,
        flags: ["sessionViewV2", "sessionViewV2Timeline"],
        defaults: [],
      }).events.topicsTranscriptByTraceId({
        projectId: "project-id",
        traceId: "trace-id",
      });
      if (!allowed) {
        await expect(result).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect(mocks.loadTopicTranscript).not.toHaveBeenCalled();
        return;
      }
      const { text, hasContent, tooLarge } = await result;
      expect({ hasContent, tooLarge }).toEqual({
        hasContent: true,
        tooLarge: false,
      });
      expect(text).toContain("[user · request] Run the tests");
      expect(text).toContain("[error TOOL bash] exit code 1");
    },
  );
});
