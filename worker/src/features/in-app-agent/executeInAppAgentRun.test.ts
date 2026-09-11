import { randomUUID } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createOrgProjectAndApiKey, logger } from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { env as sharedEnv } from "@langfuse/shared/src/env";
import { IN_APP_AGENT_TOOL_APPROVAL_EVENT_NAME } from "@langfuse/shared/in-app-agent";
import { createAndAddApiKeysToDb } from "@langfuse/shared/src/server/auth/apiKeys";
import { ResumeForwardedPropsSchema } from "./runtime/types";
import { env } from "../../env";

const createConversationId = () => `aconv_${randomUUID()}`;
const createRunId = () => `arun_${randomUUID()}`;

vi.hoisted(() => {
  // This suite uses mocked agent execution and does not exercise a sandbox
  // provider. Keep its provider selection explicit rather than inheriting the
  // developer's root .env.
  delete process.env.LANGFUSE_IN_APP_AGENT_SANDBOX_PROVIDER;
  process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION ??= "DEV";
  process.env.NEXTAUTH_URL ??= "http://localhost:3000";
  process.env.LANGFUSE_AI_PROVIDER ??= "bedrock";
  process.env.LANGFUSE_AI_AWS_BEDROCK_REGION ??= "eu-central-1";
  process.env.LANGFUSE_AI_MODEL ??= "test-bedrock-model";
});

/**
 * The agent loop contract is faked per test: a scenario drives the stream's
 * option callbacks (events, complete/abort/error, finish) exactly like the
 * real Mastra loop would, while everything else — claim CAS, heartbeat,
 * MCP-key lifecycle, event persistence — runs against the real database.
 */
type AgentScenario = (ctx: {
  input: {
    threadId: string;
    runId: string;
    context: Array<{ description: string; value: string }>;
    forwardedProps: unknown;
  };
  signal: AbortSignal;
  options: {
    model: {
      provider: "bedrock";
      modelId: string;
    };
    awsProfile?: string;
    langfuseClient?: unknown;
    useLocalPrompt: boolean;
    langfuseMcp: {
      toolPolicy: {
        available: ReadonlySet<string>;
        autoApproved: ReadonlySet<string>;
      };
      runOverride?: string;
    };
    onEvent: (event: unknown) => Promise<void> | void;
    onApprovedToolCallExecuted?: () => Promise<void> | void;
    onComplete: (outcome?: {
      reachedStepLimit?: boolean;
      truncatedByStepLimit?: boolean;
      truncatedByOutputLimit?: boolean;
    }) => Promise<void>;
    onAbort: () => Promise<void>;
    onError: (error: unknown) => Promise<void>;
    onFinish: () => Promise<void>;
  };
}) => Promise<void>;

const scenarioRef = vi.hoisted(() => ({
  current: undefined as AgentScenario | undefined,
  failApiKeyDelete: false,
  failFinishClaimedRun: false,
  apiKeyDeleteCalls: 0,
  titleInferenceCalls: 0,
  instanceEnabled: true,
}));

const observabilityRef = vi.hoisted(() => ({
  traceException: vi.fn(),
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@langfuse/shared/src/server")>();
  return {
    ...actual,
    traceException: (...args: unknown[]) =>
      observabilityRef.traceException(...args),
  };
});

vi.mock("./runtime/agent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./runtime/agent")>();
  return {
    ...actual,
    createAgUiStream: async (params: {
      input: never;
      signal: AbortSignal;
      options: never;
    }) => {
      const scenario = scenarioRef.current;
      if (!scenario) throw new Error("No agent scenario configured");

      return new ReadableStream({
        async start(controller) {
          try {
            await scenario({
              input: params.input,
              signal: params.signal,
              options: params.options,
            });
            controller.close();
          } catch (error) {
            // Mirrors the real loop's failStream: a scenario throw surfaces
            // to the worker as an errored stream (rejected reader.read()).
            controller.error(error);
          }
        },
      });
    },
  };
});

vi.mock(
  "@langfuse/shared/in-app-agent/server/tunables",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@langfuse/shared/in-app-agent/server/tunables")
    >()),
    IN_APP_AGENT_HEARTBEAT_INTERVAL_MS: 50,
  }),
);

vi.mock(
  "@langfuse/shared/in-app-agent/server/modelProvider",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@langfuse/shared/in-app-agent/server/modelProvider")
      >();

    return {
      ...actual,
      isInAppAgentInstanceEnabled: () => scenarioRef.instanceEnabled,
    };
  },
);

vi.mock(
  "@langfuse/shared/in-app-agent/server/runLifecycle",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@langfuse/shared/in-app-agent/server/runLifecycle")
      >();

    return {
      ...actual,
      finishClaimedRun: async (
        ...args: Parameters<typeof actual.finishClaimedRun>
      ) => {
        if (scenarioRef.failFinishClaimedRun) {
          throw new Error("simulated persist failure");
        }
        return actual.finishClaimedRun(...args);
      },
    };
  },
);

vi.mock("@langfuse/shared/src/server/auth/apiKeys", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@langfuse/shared/src/server/auth/apiKeys")
    >();

  return {
    ...actual,
    deleteInAppAgentMcpApiKeyFromDb: async (
      ...args: Parameters<typeof actual.deleteInAppAgentMcpApiKeyFromDb>
    ) => {
      scenarioRef.apiKeyDeleteCalls += 1;
      if (scenarioRef.failApiKeyDelete) {
        throw new Error("simulated api key delete failure");
      }
      return actual.deleteInAppAgentMcpApiKeyFromDb(...args);
    },
  };
});

import {
  executeInAppAgentRun,
  abortActiveInAppAgentRuns,
} from "./executeInAppAgentRun";

const textChunk = (delta: string) => ({
  type: "TEXT_MESSAGE_CHUNK",
  messageId: "msg-1",
  role: "assistant",
  delta,
});

const interruptEvent = (parentRunId: string, toolCallId = "tc-1") => ({
  type: "CUSTOM",
  name: "on_interrupt",
  value: {
    type: "mastra_suspend",
    toolCallId,
    toolName: "langfuse_createTextPrompt",
    args: { name: "p" },
    runId: parentRunId,
  },
});

const completingScenario: AgentScenario = async ({ options }) => {
  await options.onEvent(textChunk("Hello "));
  await options.onEvent(textChunk("world"));
  await options.onComplete();
  await options.onFinish();
};

async function seedBackgroundRun(opts?: {
  request?: unknown;
  status?: string;
  aiFeaturesEnabled?: boolean;
  alwaysAllowedTools?: string[];
}) {
  const { projectId } = await createOrgProjectAndApiKey();
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
  });
  await prisma.organization.update({
    where: { id: project.orgId },
    data: {
      aiFeaturesEnabled: opts?.aiFeaturesEnabled ?? true,
      aiTelemetryEnabled: false,
    },
  });
  const user = await prisma.user.create({
    data: { email: `bg-${randomUUID()}@langfuse.com`, name: "bg-user" },
  });
  await prisma.organizationMembership.create({
    data: { orgId: project.orgId, userId: user.id, role: "MEMBER" },
  });
  const conversation = await prisma.inAppAgentConversation.create({
    data: {
      id: createConversationId(),
      projectId,
      createdByUserId: user.id,
      title: "background test",
      alwaysAllowedTools: opts?.alwaysAllowedTools,
    },
  });
  const run = await prisma.inAppAgentRun.create({
    data: {
      id: createRunId(),
      projectId,
      conversationId: conversation.id,
      triggeredByUserId: user.id,
      model: "test-bedrock-model",
      status: opts?.status ?? "QUEUED",
      request: (opts?.request ?? { kind: "userMessage", context: [] }) as never,
    },
  });

  return { projectId, orgId: project.orgId, user, conversation, run };
}

const getRun = (projectId: string, runId: string) =>
  prisma.inAppAgentRun.findUniqueOrThrow({
    where: { id_projectId: { id: runId, projectId } },
  });

const getInAppAgentApiKeys = (projectId: string) =>
  prisma.apiKey.findMany({ where: { projectId, isInAppAgentKey: true } });

/** A run resuming an approved tool call whose interrupt event is persisted on a parked parent run. */
async function seedApprovedContinuation(opts?: {
  context?: Array<{ description: string; value: string }>;
  alwaysAllowedTools?: string[];
  continuationNumber?: number;
  rootRunId?: string;
  traceStartedAt?: string;
  approvalRequestedAt?: string;
}) {
  const seeded = await seedBackgroundRun({
    alwaysAllowedTools: opts?.alwaysAllowedTools,
  });
  const { projectId, conversation, run, user } = seeded;
  const parentRun = await prisma.inAppAgentRun.create({
    data: {
      id: createRunId(),
      projectId,
      conversationId: conversation.id,
      triggeredByUserId: user.id,
      status: "SUCCEEDED",
      finishedAt: new Date(),
    },
  });
  await prisma.inAppAgentEvent.create({
    data: {
      projectId,
      conversationId: conversation.id,
      runId: parentRun.id,
      sequenceNumber: 1,
      type: "CUSTOM",
      event: interruptEvent(parentRun.id) as never,
    },
  });
  await prisma.inAppAgentRun.update({
    where: { id_projectId: { id: run.id, projectId } },
    data: {
      request: {
        kind: "approvalDecision",
        parentRunId: parentRun.id,
        ...(opts?.rootRunId ? { rootRunId: opts.rootRunId } : {}),
        ...(opts?.traceStartedAt
          ? { traceStartedAt: opts.traceStartedAt }
          : {}),
        ...(opts?.approvalRequestedAt
          ? { approvalRequestedAt: opts.approvalRequestedAt }
          : {}),
        toolCallId: "tc-1",
        approved: true,
        ...(opts?.continuationNumber
          ? { continuationNumber: opts.continuationNumber }
          : {}),
        ...(opts?.context ? { context: opts.context } : {}),
      },
    },
  });

  return seeded;
}

describe("executeInAppAgentRun", () => {
  beforeEach(() => {
    scenarioRef.titleInferenceCalls = 0;
    scenarioRef.instanceEnabled = true;
    scenarioRef.failFinishClaimedRun = false;
    observabilityRef.traceException.mockClear();
  });

  it("does not regenerate the conversation title after executing a user-message run", async () => {
    const { projectId, run } = await seedBackgroundRun();

    scenarioRef.current = completingScenario;

    await executeInAppAgentRun({ projectId, runId: run.id });

    expect(scenarioRef.titleInferenceCalls).toBe(0);
  });

  it("prefers the ambient AWS profile over the configured agent profile", async () => {
    const workerEnv = env as {
      AWS_PROFILE?: string;
      LANGFUSE_IN_APP_AGENT_AWS_PROFILE?: string;
    };
    const originalAwsProfile = workerEnv.AWS_PROFILE;
    const originalConfiguredProfile =
      workerEnv.LANGFUSE_IN_APP_AGENT_AWS_PROFILE;
    workerEnv.AWS_PROFILE = "developer-profile";
    workerEnv.LANGFUSE_IN_APP_AGENT_AWS_PROFILE = "playground";

    const { projectId, run } = await seedBackgroundRun();
    scenarioRef.current = async ({ options }) => {
      expect(options.awsProfile).toBe("developer-profile");
      await options.onComplete();
      await options.onFinish();
    };

    try {
      await executeInAppAgentRun({ projectId, runId: run.id });
    } finally {
      workerEnv.AWS_PROFILE = originalAwsProfile;
      workerEnv.LANGFUSE_IN_APP_AGENT_AWS_PROFILE = originalConfiguredProfile;
    }
  });

  it("uses the bundled prompt in self-hosted production", async () => {
    const originalCloudRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;

    const { projectId, run } = await seedBackgroundRun();
    scenarioRef.current = async ({ options }) => {
      expect(options.useLocalPrompt).toBe(true);
      expect(options.langfuseClient).toBeUndefined();
      await options.onComplete();
      await options.onFinish();
    };

    try {
      await executeInAppAgentRun({ projectId, runId: run.id });
    } finally {
      env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalCloudRegion;
    }
  });

  it("passes persisted continuation context to the agent input", async () => {
    const rootRunId = "root-run-1";
    const traceStartedAt = "2026-08-14T10:00:00.000Z";
    const approvalRequestedAt = "2026-08-14T10:00:05.000Z";
    const context = [
      {
        description: "current_url",
        value: '{"pathname":"/project/project-1/traces"}',
      },
      { description: "browser_languages", value: '["de-DE"]' },
    ];
    const { projectId, run } = await seedApprovedContinuation({
      context,
      continuationNumber: 3,
      rootRunId,
      traceStartedAt,
      approvalRequestedAt,
    });

    scenarioRef.current = async ({ input, options }) => {
      expect(input.context).toEqual(context);
      const resume = ResumeForwardedPropsSchema.parse(input.forwardedProps)
        .command.resume;
      expect(resume).toMatchObject({
        continuationNumber: 3,
        rootRunId,
        traceStartedAt,
        approvalRequestedAt,
        approvalDecidedAt: run.createdAt.toISOString(),
      });
      await options.onComplete();
      await options.onFinish();
    };

    await executeInAppAgentRun({ projectId, runId: run.id });
  });

  it("defaults legacy continuation context to an empty array", async () => {
    const { projectId, run } = await seedApprovedContinuation();

    scenarioRef.current = async ({ input, options }) => {
      expect(input.context).toEqual([]);
      await options.onComplete();
      await options.onFinish();
    };

    await executeInAppAgentRun({ projectId, runId: run.id });
    expect((await getRun(projectId, run.id)).status).toBe("SUCCEEDED");
  });

  it("applies persisted grants to the next continuation's MCP policy", async () => {
    const { projectId, run } = await seedApprovedContinuation({
      alwaysAllowedTools: ["langfuse_upsertDataset"],
    });

    scenarioRef.current = async ({ options }) => {
      expect(options.langfuseMcp.toolPolicy.autoApproved).toContain(
        "upsertDataset",
      );
      expect(JSON.parse(options.langfuseMcp.runOverride ?? "")).toEqual({
        toolName: "createTextPrompt",
        toolNames: ["createTextPrompt", "upsertDataset"],
      });
      await options.onComplete();
      await options.onFinish();
    };

    await executeInAppAgentRun({ projectId, runId: run.id });
  });

  it("executes a queued run to SUCCEEDED with persisted events and full MCP-key lifecycle", async () => {
    const { projectId, conversation, run } = await seedBackgroundRun();

    let keysDuringRun = -1;
    scenarioRef.current = async ({ options }) => {
      keysDuringRun = (await getInAppAgentApiKeys(projectId)).length;
      await options.onEvent({
        type: "RUN_STARTED",
        threadId: conversation.id,
        runId: run.id,
      });
      await options.onEvent(textChunk("Hello "));
      await options.onEvent(textChunk("world"));
      await options.onComplete();
      await options.onFinish();
    };

    await executeInAppAgentRun({ projectId, runId: run.id });

    const finished = await getRun(projectId, run.id);
    expect(finished.status).toBe("SUCCEEDED");
    expect(finished.finishedAt).not.toBeNull();
    expect(finished.claimedAt).not.toBeNull();
    expect(finished.heartbeatAt).not.toBeNull();
    expect(finished.errorCode).toBeNull();
    // Key was minted and linked during the run, deleted and unlinked after.
    expect(keysDuringRun).toBe(1);
    expect(await getInAppAgentApiKeys(projectId)).toHaveLength(0);
    expect(finished.mcpApiKeyId).toBeNull();

    // Events persisted append-only; the stream's RUN_STARTED is skipped
    // (the submitter persists it), text chunks are compacted.
    const events = await prisma.inAppAgentEvent.findMany({
      where: { projectId, conversationId: conversation.id },
      orderBy: { sequenceNumber: "asc" },
    });
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.type !== "RUN_STARTED")).toBe(true);
    const merged = events.find((e) => e.type === "TEXT_MESSAGE_CHUNK");
    expect(merged).toBeDefined();
    expect((merged!.event as { delta?: string }).delta).toBe("Hello world");
  });

  it("persists a tool-approval source next to TOOL_CALL_START", async () => {
    const { projectId, conversation, run } = await seedBackgroundRun();

    scenarioRef.current = async ({ options }) => {
      await options.onEvent({
        type: "TOOL_CALL_START",
        toolCallId: "tool-call-read",
        toolCallName: "read",
      });
      await options.onEvent({
        type: "TOOL_CALL_END",
        toolCallId: "tool-call-read",
      });
      await options.onComplete();
      await options.onFinish();
    };

    await executeInAppAgentRun({ projectId, runId: run.id });

    const events = await prisma.inAppAgentEvent.findMany({
      where: { projectId, conversationId: conversation.id },
      orderBy: { sequenceNumber: "asc" },
    });
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining(["TOOL_CALL_START", "CUSTOM", "TOOL_CALL_END"]),
    );
    expect(events).toHaveLength(3);
    expect(
      events.find((event) => event.type === "CUSTOM")?.event,
    ).toMatchObject({
      name: IN_APP_AGENT_TOOL_APPROVAL_EVENT_NAME,
      value: {
        toolCallId: "tool-call-read",
        toolName: "read",
        source: "auto",
      },
    });
  });

  it("records step_limit on SUCCEEDED when the loop hits the cap without a stop finish", async () => {
    const { projectId, run } = await seedBackgroundRun();

    scenarioRef.current = async ({ options }) => {
      await options.onEvent(textChunk("Still calling tools"));
      // Truncation implies the cap was reached: wrap-up fires one step earlier.
      await options.onComplete({
        reachedStepLimit: true,
        truncatedByStepLimit: true,
      });
      await options.onFinish();
    };

    await executeInAppAgentRun({ projectId, runId: run.id });

    const finished = await getRun(projectId, run.id);
    expect(finished.status).toBe("SUCCEEDED");
    expect(finished.errorCode).toBe("step_limit");
    expect(finished.errorMessage).toMatch(/step limit/i);
  });

  it("records output_limit on SUCCEEDED when the last step ends with a length finish", async () => {
    const { projectId, run } = await seedBackgroundRun();

    scenarioRef.current = async ({ options }) => {
      await options.onEvent(textChunk("Here is the beginning of a long"));
      await options.onComplete({
        reachedStepLimit: false,
        truncatedByStepLimit: false,
        truncatedByOutputLimit: true,
      });
      await options.onFinish();
    };

    await executeInAppAgentRun({ projectId, runId: run.id });

    const finished = await getRun(projectId, run.id);
    expect(finished.status).toBe("SUCCEEDED");
    expect(finished.errorCode).toBe("output_limit");
    expect(finished.errorMessage).toMatch(/output-token limit/i);
  });

  it("acknowledges duplicate delivery without executing (claim CAS returns no row)", async () => {
    const { projectId, run } = await seedBackgroundRun({ status: "RUNNING" });

    scenarioRef.current = async () => {
      throw new Error("agent loop must not start on duplicate delivery");
    };

    await executeInAppAgentRun({ projectId, runId: run.id });

    const untouched = await getRun(projectId, run.id);
    expect(untouched.status).toBe("RUNNING");
    expect(await getInAppAgentApiKeys(projectId)).toHaveLength(0);
  });

  it("parks on an interrupt event: AWAITING_APPROVAL with the raw interrupt persisted", async () => {
    const { projectId, conversation, run } = await seedBackgroundRun();

    scenarioRef.current = async ({ options }) => {
      await options.onEvent(textChunk("Proposing a mutation"));
      await options.onEvent(interruptEvent(run.id));
      await options.onComplete();
      await options.onFinish();
    };

    await executeInAppAgentRun({ projectId, runId: run.id });

    const parked = await getRun(projectId, run.id);
    expect(parked.status).toBe("AWAITING_APPROVAL");
    expect(parked.finishedAt).not.toBeNull();
    expect(parked.errorCode).toBeNull();
    expect(parked.mcpApiKeyId).toBeNull();
    expect(await getInAppAgentApiKeys(projectId)).toHaveLength(0);

    const interruptRows = await prisma.inAppAgentEvent.findMany({
      where: { projectId, conversationId: conversation.id, type: "CUSTOM" },
    });
    expect(interruptRows).toHaveLength(1);
    expect(
      (interruptRows[0].event as { value?: { toolCallId?: string } }).value
        ?.toolCallId,
    ).toBe("tc-1");
  });

  it("finishes FAILED (agent_error) when the loop errors, keeping partial events", async () => {
    const { projectId, conversation, run } = await seedBackgroundRun();

    scenarioRef.current = async ({ options }) => {
      await options.onEvent(textChunk("partial"));
      await options.onError(new Error("model exploded"));
      await options.onFinish();
    };

    await executeInAppAgentRun({ projectId, runId: run.id });

    const failed = await getRun(projectId, run.id);
    expect(failed.status).toBe("FAILED");
    expect(failed.errorCode).toBe("agent_error");
    expect(failed.errorMessage).toBe("model exploded");
    expect(await getInAppAgentApiKeys(projectId)).toHaveLength(0);
    expect(failed.mcpApiKeyId).toBeNull();

    const events = await prisma.inAppAgentEvent.findMany({
      where: { projectId, conversationId: conversation.id },
    });
    expect(events.length).toBeGreaterThan(0);
  });

  it("cancels within a heartbeat when cancel_requested_at is set", async () => {
    const { projectId, run } = await seedBackgroundRun();
    await prisma.inAppAgentRun.update({
      where: { id_projectId: { id: run.id, projectId } },
      data: { cancelRequestedAt: new Date() },
    });

    scenarioRef.current = async ({ signal, options }) => {
      await options.onEvent(textChunk("working"));
      await new Promise<void>((resolve) => {
        if (signal.aborted) return resolve();
        signal.addEventListener("abort", () => resolve(), { once: true });
      });
      await options.onAbort();
      await options.onFinish();
    };

    await executeInAppAgentRun({ projectId, runId: run.id });

    const cancelled = await getRun(projectId, run.id);
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.errorCode).toBe("cancelled");
    expect(await getInAppAgentApiKeys(projectId)).toHaveLength(0);
  });

  it("finishes cancellation after its conversation is soft-deleted", async () => {
    const { projectId, conversation, run } = await seedBackgroundRun();

    scenarioRef.current = async ({ signal, options }) => {
      await prisma.$transaction([
        prisma.inAppAgentRun.update({
          where: { id_projectId: { id: run.id, projectId } },
          data: { cancelRequestedAt: new Date() },
        }),
        prisma.inAppAgentConversation.update({
          where: { id_projectId: { id: conversation.id, projectId } },
          data: { deletedAt: new Date() },
        }),
      ]);
      await new Promise<void>((resolve) => {
        if (signal.aborted) return resolve();
        signal.addEventListener("abort", () => resolve(), { once: true });
      });
      await options.onAbort();
      await options.onFinish();
    };

    await expect(
      executeInAppAgentRun({ projectId, runId: run.id }),
    ).resolves.toBeUndefined();

    const cancelled = await getRun(projectId, run.id);
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.finishedAt).not.toBeNull();
    expect(cancelled.errorCode).toBe("cancelled");
    expect(await getInAppAgentApiKeys(projectId)).toHaveLength(0);
  });

  it("stops writing when fenced: an externally reconciled run keeps its recorded outcome", async () => {
    const { projectId, run } = await seedBackgroundRun();

    scenarioRef.current = async ({ signal, options }) => {
      // Simulate read-side reconciliation flipping the run away mid-loop.
      await prisma.inAppAgentRun.update({
        where: { id_projectId: { id: run.id, projectId } },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          errorCode: "worker_lost",
          errorMessage: "The run was interrupted.",
        },
      });
      await new Promise<void>((resolve) => {
        if (signal.aborted) return resolve();
        signal.addEventListener("abort", () => resolve(), { once: true });
      });
      expect(signal.reason).toBe("fenced");
      await options.onAbort();
      await options.onFinish();
    };

    await executeInAppAgentRun({ projectId, runId: run.id });

    const fenced = await getRun(projectId, run.id);
    expect(fenced.status).toBe("FAILED");
    expect(fenced.errorCode).toBe("worker_lost");
    expect(fenced.errorMessage).toBe("The run was interrupted.");
    expect(await getInAppAgentApiKeys(projectId)).toHaveLength(0);
  });

  it("finishes an approved continuation without a persisted tool result as FAILED (outcome_unknown)", async () => {
    const { projectId, run } = await seedApprovedContinuation();

    scenarioRef.current = async ({ input, options }) => {
      // Zero-trust resume: args come from the persisted interrupt event.
      expect(
        (
          input.forwardedProps as {
            command: { resume: { approvalRequest: { toolName: string } } };
          }
        ).command.resume.approvalRequest.toolName,
      ).toBe("langfuse_createTextPrompt");
      await options.onError(new Error("died mid-mutation"));
      await options.onFinish();
    };

    await executeInAppAgentRun({ projectId, runId: run.id });

    const failed = await getRun(projectId, run.id);
    expect(failed.status).toBe("FAILED");
    expect(failed.errorCode).toBe("outcome_unknown");
  });

  it("records outcome_unknown, not CANCELLED, when a cancel interrupts an approved mutation before its result persists", async () => {
    const { projectId, run } = await seedApprovedContinuation();
    await prisma.inAppAgentRun.update({
      where: { id_projectId: { id: run.id, projectId } },
      data: { cancelRequestedAt: new Date() },
    });

    scenarioRef.current = async ({ signal, options }) => {
      // The approved tool is "in flight": no TOOL_CALL_RESULT is persisted
      // before the heartbeat-picked-up cancel aborts the loop.
      await new Promise<void>((resolve) => {
        if (signal.aborted) return resolve();
        signal.addEventListener("abort", () => resolve(), { once: true });
      });
      await options.onAbort();
      await options.onFinish();
    };

    await executeInAppAgentRun({ projectId, runId: run.id });

    const finished = await getRun(projectId, run.id);
    expect(finished.status).toBe("FAILED");
    expect(finished.errorCode).toBe("outcome_unknown");
  });

  it("keeps outcome_unknown when the loop dies in the executed-but-unpersisted window (no execution-time flag)", async () => {
    const { projectId, run } = await seedApprovedContinuation();

    scenarioRef.current = async ({ options }) => {
      // Mirrors human-in-the-loop.ts: the approved mutation completed and the
      // execution callback fires (if wired), but the crash happens before the
      // synthetic TOOL_CALL_RESULT ever reaches onEvent.
      await options.onApprovedToolCallExecuted?.();
      throw new Error("adapter teardown crashed");
    };

    await expect(
      executeInAppAgentRun({ projectId, runId: run.id }),
    ).resolves.toBeUndefined();

    const failed = await getRun(projectId, run.id);
    expect(failed.status).toBe("FAILED");
    expect(failed.errorCode).toBe("outcome_unknown");
    expect(await getInAppAgentApiKeys(projectId)).toHaveLength(0);
  });

  it("acknowledges a loop-phase error after the run is already FAILED so the job does not land in the DLQ", async () => {
    const { projectId, run } = await seedBackgroundRun();

    scenarioRef.current = async ({ options }) => {
      await options.onEvent(textChunk("partial"));
      throw new Error("persistence blew up");
    };

    await expect(
      executeInAppAgentRun({ projectId, runId: run.id }),
    ).resolves.toBeUndefined();

    const failed = await getRun(projectId, run.id);
    expect(failed.status).toBe("FAILED");
    expect(failed.errorCode).toBe("agent_error");
    expect(failed.errorMessage).toBe("persistence blew up");
    expect(await getInAppAgentApiKeys(projectId)).toHaveLength(0);
    expect(observabilityRef.traceException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "persistence blew up" }),
    );
  });

  it("still fails the job when terminal persist throws", async () => {
    const { projectId, run } = await seedBackgroundRun();

    scenarioRef.failFinishClaimedRun = true;
    scenarioRef.current = async ({ options }) => {
      await options.onEvent(textChunk("partial"));
      throw new Error("loop died");
    };

    try {
      await expect(
        executeInAppAgentRun({ projectId, runId: run.id }),
      ).rejects.toThrow("simulated persist failure");
    } finally {
      scenarioRef.failFinishClaimedRun = false;
    }

    const unfinished = await getRun(projectId, run.id);
    expect(unfinished.status).toBe("RUNNING");
  });

  it("deletes the MCP key exactly once when the loop's onFinish races the outer catch", async () => {
    const { projectId, run } = await seedBackgroundRun();
    scenarioRef.apiKeyDeleteCalls = 0;

    scenarioRef.current = async ({ options }) => {
      await options.onEvent(textChunk("partial"));
      // Replicate failStream exactly: the terminal onError→onFinish chain is
      // fired WITHOUT awaiting it, then the stream errors synchronously —
      // so onFinish's cleanup races the outer catch's cleanup.
      void (async () => {
        await options.onError(new Error("persist failed"));
        await options.onFinish();
      })();
      throw new Error("persist failed");
    };

    await expect(
      executeInAppAgentRun({ projectId, runId: run.id }),
    ).resolves.toBeUndefined();

    await vi.waitFor(async () => {
      expect(await getInAppAgentApiKeys(projectId)).toHaveLength(0);
    });
    const failed = await getRun(projectId, run.id);
    expect(failed.status).toBe("FAILED");
    expect(failed.errorCode).toBe("agent_error");
    expect(failed.mcpApiKeyId).toBeNull();
    expect(scenarioRef.apiKeyDeleteCalls).toBe(1);
  });

  it("reconciles a stale RUNNING delivery and acknowledges without starting the agent loop", async () => {
    const { projectId, run, user } = await seedBackgroundRun({
      status: "RUNNING",
    });
    const twoMinutesAgo = new Date(Date.now() - 2 * 60_000);
    const key = await createAndAddApiKeysToDb({
      prisma,
      entityId: projectId,
      scope: "PROJECT",
      note: "stale-run mcp key",
      isInAppAgentKey: true,
      createdByUserId: user.id,
    });
    await prisma.inAppAgentRun.update({
      where: { id_projectId: { id: run.id, projectId } },
      data: {
        claimedAt: twoMinutesAgo,
        heartbeatAt: twoMinutesAgo,
        mcpApiKeyId: key.id,
      },
    });

    scenarioRef.current = async () => {
      throw new Error(
        "agent loop must not start on stale unclaimable delivery",
      );
    };

    await expect(
      executeInAppAgentRun({ projectId, runId: run.id }),
    ).resolves.toBeUndefined();

    const failed = await getRun(projectId, run.id);
    expect(failed.status).toBe("FAILED");
    expect(failed.errorCode).toBe("worker_lost");
    expect(failed.finishedAt).not.toBeNull();
    expect(failed.mcpApiKeyId).toBeNull();
    expect(await getInAppAgentApiKeys(projectId)).toHaveLength(0);
  });

  it("clears the MCP pointer on claim-miss even when the key row is already gone", async () => {
    const { projectId, run, user } = await seedBackgroundRun({
      status: "RUNNING",
    });
    const twoMinutesAgo = new Date(Date.now() - 2 * 60_000);
    const key = await createAndAddApiKeysToDb({
      prisma,
      entityId: projectId,
      scope: "PROJECT",
      note: "already-deleted mcp key",
      isInAppAgentKey: true,
      createdByUserId: user.id,
    });
    await prisma.inAppAgentRun.update({
      where: { id_projectId: { id: run.id, projectId } },
      data: {
        claimedAt: twoMinutesAgo,
        heartbeatAt: twoMinutesAgo,
        mcpApiKeyId: key.id,
      },
    });
    await prisma.apiKey.delete({ where: { id: key.id } });

    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
    scenarioRef.current = async () => {
      throw new Error(
        "agent loop must not start on stale unclaimable delivery",
      );
    };

    try {
      await expect(
        executeInAppAgentRun({ projectId, runId: run.id }),
      ).resolves.toBeUndefined();
    } finally {
      errorSpy.mockRestore();
    }

    const failed = await getRun(projectId, run.id);
    expect(failed.status).toBe("FAILED");
    expect(failed.errorCode).toBe("worker_lost");
    expect(failed.mcpApiKeyId).toBeNull();
    expect(
      errorSpy.mock.calls.filter(([message]) =>
        String(message).includes(
          "Failed to clean up in-app agent MCP key on reconcile",
        ),
      ),
    ).toHaveLength(0);
  });

  it("leaves a user project key intact when mcpApiKeyId points at it", async () => {
    const { projectId, run, user } = await seedBackgroundRun({
      status: "RUNNING",
    });
    const twoMinutesAgo = new Date(Date.now() - 2 * 60_000);
    const userKey = await createAndAddApiKeysToDb({
      prisma,
      entityId: projectId,
      scope: "PROJECT",
      note: "user project key",
      isInAppAgentKey: false,
      createdByUserId: user.id,
    });
    await prisma.inAppAgentRun.update({
      where: { id_projectId: { id: run.id, projectId } },
      data: {
        claimedAt: twoMinutesAgo,
        heartbeatAt: twoMinutesAgo,
        mcpApiKeyId: userKey.id,
      },
    });

    scenarioRef.current = async () => {
      throw new Error(
        "agent loop must not start on stale unclaimable delivery",
      );
    };

    await expect(
      executeInAppAgentRun({ projectId, runId: run.id }),
    ).resolves.toBeUndefined();

    const failed = await getRun(projectId, run.id);
    expect(failed.status).toBe("FAILED");
    expect(failed.errorCode).toBe("worker_lost");
    expect(failed.mcpApiKeyId).toBeNull();
    expect(
      await prisma.apiKey.findUnique({ where: { id: userKey.id } }),
    ).not.toBeNull();
  });

  it("acknowledges delivery against an already-FAILED run without changing it", async () => {
    const { projectId, run } = await seedBackgroundRun({ status: "FAILED" });
    const finishedAt = new Date("2026-08-01T00:00:00.000Z");
    await prisma.inAppAgentRun.update({
      where: { id_projectId: { id: run.id, projectId } },
      data: {
        finishedAt,
        errorCode: "agent_error",
        errorMessage: "already terminal",
      },
    });

    scenarioRef.current = async () => {
      throw new Error("agent loop must not start on terminal delivery");
    };

    await expect(
      executeInAppAgentRun({ projectId, runId: run.id }),
    ).resolves.toBeUndefined();

    const unchanged = await getRun(projectId, run.id);
    expect(unchanged.status).toBe("FAILED");
    expect(unchanged.errorCode).toBe("agent_error");
    expect(unchanged.errorMessage).toBe("already terminal");
    expect(unchanged.finishedAt?.toISOString()).toBe(finishedAt.toISOString());
  });

  it("fails revalidation at claim as FAILED (init_failed) when AI features are disabled", async () => {
    const { projectId, run } = await seedBackgroundRun({
      aiFeaturesEnabled: false,
    });

    scenarioRef.current = async () => {
      throw new Error("agent loop must not start when revalidation fails");
    };

    await executeInAppAgentRun({ projectId, runId: run.id });

    const failed = await getRun(projectId, run.id);
    expect(failed.status).toBe("FAILED");
    expect(failed.errorCode).toBe("init_failed");
    expect(await getInAppAgentApiKeys(projectId)).toHaveLength(0);
    expect(observabilityRef.traceException).not.toHaveBeenCalled();
  });

  it("fails revalidation at claim as FAILED (init_failed) when in-app agent is instance-disabled", async () => {
    scenarioRef.instanceEnabled = false;
    const { projectId, run } = await seedBackgroundRun();
    scenarioRef.current = async () => {
      throw new Error("agent loop must not start when the instance is off");
    };

    await executeInAppAgentRun({ projectId, runId: run.id });

    const failed = await getRun(projectId, run.id);
    expect(failed.status).toBe("FAILED");
    expect(failed.errorCode).toBe("init_failed");
    expect(await getInAppAgentApiKeys(projectId)).toHaveLength(0);
  });

  it("claims a run when LANGFUSE_AI_AWS_BEDROCK_REGION is unset", async () => {
    const originalRegion = sharedEnv.LANGFUSE_AI_AWS_BEDROCK_REGION;
    const originalAiRegion = sharedEnv.LANGFUSE_AI_AWS_BEDROCK_REGION;
    (
      sharedEnv as { LANGFUSE_AI_AWS_BEDROCK_REGION?: string }
    ).LANGFUSE_AI_AWS_BEDROCK_REGION = undefined;
    (
      sharedEnv as { LANGFUSE_AI_AWS_BEDROCK_REGION?: string }
    ).LANGFUSE_AI_AWS_BEDROCK_REGION = undefined;

    try {
      const { projectId, run } = await seedBackgroundRun();
      scenarioRef.current = completingScenario;

      await executeInAppAgentRun({ projectId, runId: run.id });

      const finished = await getRun(projectId, run.id);
      expect(finished.status).toBe("SUCCEEDED");
    } finally {
      (
        sharedEnv as { LANGFUSE_AI_AWS_BEDROCK_REGION?: string }
      ).LANGFUSE_AI_AWS_BEDROCK_REGION = originalRegion;
      (
        sharedEnv as { LANGFUSE_AI_AWS_BEDROCK_REGION?: string }
      ).LANGFUSE_AI_AWS_BEDROCK_REGION = originalAiRegion;
    }
  });

  it("keeps the MCP-key pointer when the delete fails, for reconciliation to retry", async () => {
    const { projectId, run } = await seedBackgroundRun();

    scenarioRef.current = completingScenario;
    scenarioRef.failApiKeyDelete = true;

    try {
      await executeInAppAgentRun({ projectId, runId: run.id });
    } finally {
      scenarioRef.failApiKeyDelete = false;
    }

    const finished = await getRun(projectId, run.id);
    expect(finished.status).toBe("SUCCEEDED");
    // Delete failed → pointer stays set and the key row still exists, so the
    // run remains the discoverable owner of the orphaned key.
    expect(finished.mcpApiKeyId).not.toBeNull();
    expect(await getInAppAgentApiKeys(projectId)).toHaveLength(1);
  });

  it("treats a missing MCP key as cleaned up and still nulls the pointer", async () => {
    const { projectId, run } = await seedBackgroundRun();
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

    scenarioRef.current = async ({ options }) => {
      const keys = await getInAppAgentApiKeys(projectId);
      expect(keys).toHaveLength(1);
      await prisma.apiKey.delete({ where: { id: keys[0].id } });
      await options.onComplete();
      await options.onFinish();
    };

    try {
      await executeInAppAgentRun({ projectId, runId: run.id });
    } finally {
      errorSpy.mockRestore();
    }

    const finished = await getRun(projectId, run.id);
    expect(finished.status).toBe("SUCCEEDED");
    expect(finished.mcpApiKeyId).toBeNull();
    expect(await getInAppAgentApiKeys(projectId)).toHaveLength(0);
    expect(
      errorSpy.mock.calls.filter(([message]) =>
        String(message).includes("Failed to clean up in-app agent MCP API key"),
      ),
    ).toHaveLength(0);
  });

  it("aborts active runs on shutdown as FAILED (worker_shutdown)", async () => {
    const { projectId, run } = await seedBackgroundRun();

    scenarioRef.current = async ({ signal, options }) => {
      await options.onEvent(textChunk("long turn"));
      await new Promise<void>((resolve) => {
        if (signal.aborted) return resolve();
        signal.addEventListener("abort", () => resolve(), { once: true });
      });
      await options.onAbort();
      await options.onFinish();
    };

    const execution = executeInAppAgentRun({ projectId, runId: run.id });

    await vi.waitFor(async () => {
      expect((await getRun(projectId, run.id)).status).toBe("RUNNING");
    });
    abortActiveInAppAgentRuns();
    await execution;

    const failed = await getRun(projectId, run.id);
    expect(failed.status).toBe("FAILED");
    expect(failed.errorCode).toBe("worker_shutdown");
    expect(await getInAppAgentApiKeys(projectId)).toHaveLength(0);
  });
});
