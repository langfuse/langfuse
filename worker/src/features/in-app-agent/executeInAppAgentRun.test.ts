import { randomUUID } from "crypto";
import { describe, expect, it, vi } from "vitest";

import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import {
  createInAppAgentConversationId,
  createInAppAgentRunId,
} from "@langfuse/shared/in-app-agent";

// Env knobs must be set before any import evaluates the shared env/tunables.
vi.hoisted(() => {
  process.env.LANGFUSE_IN_APP_AGENT_HEARTBEAT_INTERVAL_MS = "50";
  process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION ??= "DEV";
  process.env.NEXTAUTH_URL ??= "http://localhost:3000";
  process.env.LANGFUSE_AWS_BEDROCK_REGION ??= "eu-central-1";
  process.env.LANGFUSE_AWS_BEDROCK_MODEL ??= "test-bedrock-model";
});

/**
 * The agent loop contract is faked per test: a scenario drives the stream's
 * option callbacks (events, complete/abort/error, finish) exactly like the
 * real Mastra loop would, while everything else — claim CAS, heartbeat,
 * MCP-key lifecycle, event persistence — runs against the real database.
 */
type AgentScenario = (ctx: {
  input: { threadId: string; runId: string; forwardedProps: unknown };
  signal: AbortSignal;
  options: {
    onEvent: (event: unknown) => Promise<void> | void;
    onApprovedToolCallExecuted?: () => Promise<void> | void;
    onComplete: () => Promise<void>;
    onAbort: () => Promise<void>;
    onError: (error: unknown) => Promise<void>;
    onFinish: () => Promise<void>;
  };
}) => Promise<void>;

const scenarioRef = vi.hoisted(() => ({
  current: undefined as AgentScenario | undefined,
  failApiKeyDelete: false,
}));

vi.mock("@langfuse/shared/in-app-agent/server", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@langfuse/shared/in-app-agent/server")
    >();

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

vi.mock("@langfuse/shared/src/server/auth/apiKeys", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@langfuse/shared/src/server/auth/apiKeys")
    >();

  return {
    ...actual,
    deleteApiKeyFromDb: async (
      ...args: Parameters<typeof actual.deleteApiKeyFromDb>
    ) => {
      if (scenarioRef.failApiKeyDelete) {
        throw new Error("simulated api key delete failure");
      }
      return actual.deleteApiKeyFromDb(...args);
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
      id: createInAppAgentConversationId(),
      projectId,
      createdByUserId: user.id,
      title: "background test",
    },
  });
  const run = await prisma.inAppAgentRun.create({
    data: {
      id: createInAppAgentRunId(),
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
async function seedApprovedContinuation() {
  const seeded = await seedBackgroundRun();
  const { projectId, conversation, run, user } = seeded;
  const parentRun = await prisma.inAppAgentRun.create({
    data: {
      id: createInAppAgentRunId(),
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
        toolCallId: "tc-1",
        approved: true,
      },
    },
  });

  return seeded;
}

describe("executeInAppAgentRun", () => {
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
    ).rejects.toThrow("adapter teardown crashed");

    const failed = await getRun(projectId, run.id);
    expect(failed.status).toBe("FAILED");
    expect(failed.errorCode).toBe("outcome_unknown");
    expect(await getInAppAgentApiKeys(projectId)).toHaveLength(0);
  });

  it("classifies a loop-phase stream error as agent_error, not init_failed, in the outer catch", async () => {
    const { projectId, run } = await seedBackgroundRun();

    scenarioRef.current = async ({ options }) => {
      await options.onEvent(textChunk("partial"));
      throw new Error("persistence blew up");
    };

    await expect(
      executeInAppAgentRun({ projectId, runId: run.id }),
    ).rejects.toThrow("persistence blew up");

    const failed = await getRun(projectId, run.id);
    expect(failed.status).toBe("FAILED");
    expect(failed.errorCode).toBe("agent_error");
    expect(failed.errorMessage).toBe("persistence blew up");
    expect(await getInAppAgentApiKeys(projectId)).toHaveLength(0);
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
