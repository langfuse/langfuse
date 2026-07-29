import { EventType } from "@ag-ui/core";
import { randomUUID } from "crypto";
import { z } from "zod";
import type { Session } from "next-auth";

import {
  BaseError,
  ForbiddenError,
  InAppAgentRunErrorCode,
  InAppAgentRunStatus,
  InvalidRequestError,
  isRetryableInAppAgentRunErrorCode,
  LangfuseNotFoundError,
  ScoreDataTypeEnum,
  ScoreSourceEnum,
  TEXT_SCORE_MAX_LENGTH,
} from "@langfuse/shared";
import type { PrismaClient } from "@langfuse/shared/src/db";
import {
  convertDateToClickhouseDateTime,
  InAppAgentRunQueue,
  logger,
  QueueJobs,
  redis,
  upsertScore,
} from "@langfuse/shared/src/server";
import { deleteApiKeyFromDb } from "@langfuse/shared/src/server/auth/apiKeys";
import { env } from "@/src/env.mjs";
import {
  AgUiContextSchema,
  createInAppAgentMessageId,
  createInAppAgentRunId,
  getInAppAgentInstrumentationObservationId,
  getInAppAgentInstrumentationTraceId,
  getInAppAgentRunFailureMessage,
  parseInAppAgentApprovalDecisionEvent,
} from "@langfuse/shared/in-app-agent";
import { InAppAgentMessageFeedbackValueSchema } from "@langfuse/shared/in-app-agent";
import { throwIfNoEntitlement } from "@/src/features/entitlements/server/hasEntitlement";
import {
  createTRPCRouter,
  protectedProjectProcedure,
  protectedProjectProcedureWithoutTracing,
} from "@/src/server/api/trpc";
import {
  ensureOwnedConversation,
  getConversationEvents,
  getConversationMessagesForDisplay,
  getConversationMessages,
  getOwnedConversationOrThrow,
  isInAppAgentConversationWriteLocked,
  maybeInferAndPersistConversationTitle,
  serializeConversation,
  type PersistedConversationEvent,
} from "@langfuse/shared/in-app-agent/server/persistence";
import { parseInAppAgentInterruptEvent } from "@langfuse/shared/in-app-agent/server/human-in-the-loop";
import {
  cleanupTerminalRunMcpApiKeys,
  createQueuedRun,
  decideToolApproval,
  reconcileConversationRuns,
  requestRunCancellation,
} from "@langfuse/shared/in-app-agent/server/runLifecycle";
import { resolveInAppAgentRunContext } from "@/src/features/in-app-agent/server/runContext";
import {
  assertInAppAgentRateLimit,
  getInAppAgentApiAccessScope,
} from "@/src/features/in-app-agent/server/rateLimit";

const CONVERSATION_LIST_LIMIT = 50;
const MAX_IN_APP_AGENT_MESSAGE_LENGTH = 32_000;
const SANDBOX_CONVERSATION_WRITE_LOCK_MESSAGE =
  "Sandbox-enabled conversations become read-only after 8 hours. Start a new conversation to continue.";

const ConversationListCursorSchema = z.object({
  updatedAt: z.date(),
  id: z.string(),
});

const ConversationIdInput = z.object({
  projectId: z.string(),
  conversationId: z.string(),
});

const RenameConversationInput = ConversationIdInput.extend({
  title: z.string().trim().min(1).max(80),
});

const StartRunInput = ConversationIdInput.extend({
  message: z.string().trim().min(1).max(MAX_IN_APP_AGENT_MESSAGE_LENGTH),
  /**
   * The same AG-UI context array the foreground path sends (current page, the
   * quick action and entry point that triggered the turn); resolved and
   * sanitized server-side, then stored on the run for the worker to replay.
   */
  context: z.array(AgUiContextSchema).default([]),
});

const CancelRunInput = ConversationIdInput.extend({
  runId: z.string(),
});

const DecideToolApprovalInput = ConversationIdInput.extend({
  runId: z.string(),
  toolCallId: z.string(),
  approved: z.boolean(),
});

const SubmitFeedbackInput = ConversationIdInput.extend({
  messageId: z.string(),
  runId: z.string(),
  value: InAppAgentMessageFeedbackValueSchema.nullable(),
  comment: z.string().trim().max(TEXT_SCORE_MAX_LENGTH).nullable().optional(),
});

const IN_APP_AGENT_FEEDBACK_SCORE_NAME = "in_app_agent_feedback";
const IN_APP_AGENT_FEEDBACK_ENVIRONMENT = "langfuse-in-app-agent";

export const inAppAgentRouter = createTRPCRouter({
  listConversations: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        cursor: ConversationListCursorSchema.optional(),
        limit: z.number().int().min(1).max(CONVERSATION_LIST_LIMIT).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertInAppAgentAvailable({ ctx, projectId: input.projectId });

      const conversations = await ctx.prisma.inAppAgentConversation.findMany({
        where: {
          projectId: input.projectId,
          createdByUserId: ctx.session.user.id,
          deletedAt: null,
          ...(input.cursor
            ? {
                OR: [
                  { updatedAt: { lt: input.cursor.updatedAt } },
                  {
                    updatedAt: input.cursor.updatedAt,
                    id: { lt: input.cursor.id },
                  },
                ],
              }
            : {}),
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: input.limit + 1,
      });

      const page = conversations.slice(0, input.limit);
      const lastConversation = page.at(-1);

      return {
        conversations: page.map((conversation) =>
          serializeConversation(conversation),
        ),
        nextCursor:
          conversations.length > input.limit && lastConversation
            ? {
                updatedAt: lastConversation.updatedAt,
                id: lastConversation.id,
              }
            : undefined,
      };
    }),

  getConversation: protectedProjectProcedureWithoutTracing
    .input(ConversationIdInput)
    .query(async ({ ctx, input }) => {
      await assertInAppAgentAvailable({ ctx, projectId: input.projectId });

      const conversation = await getOwnedConversationOrThrow({
        prisma: ctx.prisma,
        projectId: input.projectId,
        conversationId: input.conversationId,
        userId: ctx.session.user.id,
      });

      // Reconcile before reading: this snapshot is also the background path's
      // hydration source, and it must never show "Working" for a dead worker.
      await reconcileConversationRuns({
        prisma: ctx.prisma,
        projectId: input.projectId,
        conversationId: input.conversationId,
      });

      // A run that is terminal with its MCP-key pointer still set is the
      // discoverable owner of a key whose delete failed on the worker. Reads
      // own the retry; the RFC's TTL sweep is the backstop for the case where
      // even the pointer update was lost.
      await cleanupTerminalRunMcpApiKeys({
        prisma: ctx.prisma,
        projectId: input.projectId,
        conversationId: input.conversationId,
        deleteApiKey: async (apiKeyId) => {
          await deleteApiKeyFromDb({
            prisma: ctx.prisma,
            id: apiKeyId,
            entityId: input.projectId,
            scope: "PROJECT",
            redis,
          });
        },
      });

      const [messages, events, runs] = await Promise.all([
        getConversationMessagesForDisplay({
          prisma: ctx.prisma,
          projectId: input.projectId,
          conversationId: input.conversationId,
        }),
        getConversationEvents({
          prisma: ctx.prisma,
          projectId: input.projectId,
          conversationId: input.conversationId,
        }),
        // All runs, not just the newest: a turn that was cancelled or failed
        // mid-conversation has to be markable in the transcript, and today it is
        // completely invisible. Conversations have one run per turn, so this
        // stays small.
        ctx.prisma.inAppAgentRun.findMany({
          where: {
            projectId: input.projectId,
            conversationId: input.conversationId,
          },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            status: true,
            errorCode: true,
            errorMessage: true,
            cancelRequestedAt: true,
          },
        }),
      ]);

      const latestRun = runs.at(-1) ?? null;

      return {
        conversation: serializeConversation(conversation, {
          isWriteLocked: isInAppAgentConversationWriteLocked({
            conversation,
            events,
          }),
        }),
        messages,
        /**
         * The watch cursor. Definitionally the high-water mark of the events
         * this very snapshot was built from, so attaching the tail with
         * `> cursor` is gap-free and duplicate-free by construction — there is
         * no separate cursor read to race against.
         */
        eventCursor: events.reduce(
          (max, event) => Math.max(max, event.sequenceNumber),
          -1,
        ),
        latestRun:
          latestRun && latestRun.status
            ? {
                id: latestRun.id,
                status: latestRun.status as InAppAgentRunStatus,
                errorCode: latestRun.errorCode,
                errorMessage: latestRun.errorMessage,
                cancelRequested: Boolean(latestRun.cancelRequestedAt),
                isRetryable: isRetryableInAppAgentRunErrorCode(
                  latestRun.errorCode,
                ),
              }
            : null,
        /**
         * Approvals rendered from persistence rather than from a live stream
         * event, so a pending card survives a refresh. Undecided = an
         * interrupt event with no matching decision event.
         */
        pendingToolApprovals: getPendingToolApprovals(
          events,
          new Set(
            runs
              .filter(
                (run) => run.status === InAppAgentRunStatus.AWAITING_APPROVAL,
              )
              .map((run) => run.id),
          ),
        ),
        /**
         * Turns that ended without finishing. Their partial events stay in the
         * transcript — the tool calls really ran and the events are the only
         * record — so the UI marks the boundary instead of hiding them.
         */
        interruptedRuns: runs.flatMap((run) =>
          run.status === InAppAgentRunStatus.CANCELLED ||
          run.status === InAppAgentRunStatus.FAILED
            ? [
                {
                  id: run.id,
                  message: getInAppAgentRunFailureMessage(run.errorCode),
                },
              ]
            : [],
        ),
        state: {
          type: "existingConversation" as const,
          projectId: input.projectId,
          conversationId: input.conversationId,
        },
      };
    }),

  /**
   * Submit a turn for background execution.
   *
   * Runs the same validation chain as the foreground route, then commits the
   * run as QUEUED with its user message already appended — the events table is
   * the render source from the instant of submit, so there is no optimistic UI
   * state to survive a refresh. The BullMQ enqueue happens after commit; a
   * failure there marks the run FAILED immediately rather than leaving a
   * committed run nobody will execute.
   */
  startRun: protectedProjectProcedureWithoutTracing
    .input(StartRunInput)
    .mutation(async ({ ctx, input }) => {
      const projectAvailability = await assertInAppAgentAvailable({
        ctx,
        projectId: input.projectId,
      });

      const project = await ctx.prisma.project.findUnique({
        where: { id: input.projectId },
        select: { organization: { select: { id: true, cloudConfig: true } } },
      });

      if (!project) {
        throw new LangfuseNotFoundError("Project not found");
      }

      await assertInAppAgentRateLimit(
        getInAppAgentApiAccessScope(
          ctx.session.user,
          input.projectId,
          project.organization,
        ),
        "in-app-agent-run",
      );

      const conversation = await ensureOwnedConversation({
        prisma: ctx.prisma,
        projectId: input.projectId,
        conversationId: input.conversationId,
        userId: ctx.session.user.id,
      });

      const events = await getConversationEvents({
        prisma: ctx.prisma,
        projectId: input.projectId,
        conversationId: input.conversationId,
      });

      if (isInAppAgentConversationWriteLocked({ conversation, events })) {
        throw new BaseError(
          "PreconditionFailedError",
          412,
          SANDBOX_CONVERSATION_WRITE_LOCK_MESSAGE,
          true,
        );
      }

      const bedrockModelId = env.LANGFUSE_AWS_BEDROCK_MODEL;
      if (!bedrockModelId) {
        throw new BaseError(
          "PreconditionFailedError",
          412,
          "Assistant model is not configured.",
          true,
        );
      }

      const context = await resolveInAppAgentRunContext({
        context: input.context,
        projectId: input.projectId,
        isV4Enabled: ctx.session.user.v4BetaEnabled === true,
      });

      const runId = createInAppAgentRunId();
      const userMessage = {
        id: createInAppAgentMessageId(),
        role: "user" as const,
        content: input.message,
      };

      const run = await createQueuedRun({
        prisma: ctx.prisma,
        runId,
        projectId: input.projectId,
        conversationId: conversation.id,
        triggeredByUserId: ctx.session.user.id,
        model: bedrockModelId,
        request: { kind: "userMessage", context },
        // Shaped exactly like the foreground handler's seeded RUN_STARTED:
        // the worker reads the turn's input from `input.messages` here and
        // never writes this event itself.
        runStartedEvent: {
          type: EventType.RUN_STARTED,
          threadId: conversation.id,
          runId,
          input: {
            threadId: conversation.id,
            runId,
            state: null,
            messages: [userMessage],
            tools: [],
            context,
            forwardedProps: {},
          },
        },
      });

      await enqueueInAppAgentRun({
        prisma: ctx.prisma,
        projectId: input.projectId,
        runId: run.id,
      });

      // Fire and forget, exactly as the foreground path does: a title is nice
      // to have and must never delay or fail the turn. Without this call every
      // background conversation would keep its default timestamp title, since
      // the worker does not infer one.
      maybeInferAndPersistConversationTitle({
        prisma: ctx.prisma,
        projectId: input.projectId,
        conversationId: conversation.id,
        userId: ctx.session.user.id,
        aiTelemetryEnabled: projectAvailability.aiTelemetryEnabled,
      });

      return { runId: run.id };
    }),

  cancelRun: protectedProjectProcedureWithoutTracing
    .input(CancelRunInput)
    .mutation(async ({ ctx, input }) => {
      await assertInAppAgentAvailable({ ctx, projectId: input.projectId });

      await getOwnedConversationOrThrow({
        prisma: ctx.prisma,
        projectId: input.projectId,
        conversationId: input.conversationId,
        userId: ctx.session.user.id,
        action: "cancel",
      });

      const result = await requestRunCancellation({
        prisma: ctx.prisma,
        projectId: input.projectId,
        conversationId: input.conversationId,
        runId: input.runId,
      });

      if (result.cancelledImmediately) {
        // Best effort: the claim CAS already makes a duplicate delivery a
        // no-op, so a job left in the queue is harmless, just wasteful.
        await removeInAppAgentRunJob(input.runId);
      }

      return result;
    }),

  /**
   * Decide a pending tool approval.
   *
   * The client sends only IDs and a boolean. The tool name and arguments are
   * read server-side from the persisted interrupt event, so there is nothing
   * to tamper with on the way back and no fingerprint to keep in sync.
   */
  decideToolApproval: protectedProjectProcedureWithoutTracing
    .input(DecideToolApprovalInput)
    .mutation(async ({ ctx, input }) => {
      await assertInAppAgentAvailable({ ctx, projectId: input.projectId });

      await getOwnedConversationOrThrow({
        prisma: ctx.prisma,
        projectId: input.projectId,
        conversationId: input.conversationId,
        userId: ctx.session.user.id,
        action: "decide",
      });

      const events = await getConversationEvents({
        prisma: ctx.prisma,
        projectId: input.projectId,
        conversationId: input.conversationId,
      });

      const approvalRequest = events.find(
        (persisted) =>
          persisted.runId === input.runId &&
          parseInAppAgentInterruptEvent(persisted.event)?.toolCallId ===
            input.toolCallId,
      );

      if (!approvalRequest) {
        throw new LangfuseNotFoundError("Approval request not found");
      }

      const continuationRun = await decideToolApproval({
        prisma: ctx.prisma,
        projectId: input.projectId,
        conversationId: input.conversationId,
        parentRunId: input.runId,
        continuationRunId: createInAppAgentRunId(),
        toolCallId: input.toolCallId,
        approved: input.approved,
        decidedByUserId: ctx.session.user.id,
        model: env.LANGFUSE_AWS_BEDROCK_MODEL,
      });

      await enqueueInAppAgentRun({
        prisma: ctx.prisma,
        projectId: input.projectId,
        runId: continuationRun.id,
      });

      return { runId: continuationRun.id };
    }),

  deleteConversation: protectedProjectProcedureWithoutTracing
    .input(ConversationIdInput)
    .mutation(async ({ ctx, input }) => {
      await assertInAppAgentAvailable({ ctx, projectId: input.projectId });

      await getOwnedConversationOrThrow({
        prisma: ctx.prisma,
        projectId: input.projectId,
        conversationId: input.conversationId,
        userId: ctx.session.user.id,
      });

      await ctx.prisma.inAppAgentConversation.update({
        where: {
          id_projectId: {
            id: input.conversationId,
            projectId: input.projectId,
          },
        },
        data: {
          providerSessionId: null,
          deletedAt: new Date(),
        },
      });

      return { success: true };
    }),

  renameConversation: protectedProjectProcedureWithoutTracing
    .input(RenameConversationInput)
    .mutation(async ({ ctx, input }) => {
      await assertInAppAgentAvailable({ ctx, projectId: input.projectId });

      await getOwnedConversationOrThrow({
        prisma: ctx.prisma,
        projectId: input.projectId,
        conversationId: input.conversationId,
        userId: ctx.session.user.id,
      });

      const conversation = await ctx.prisma.inAppAgentConversation.update({
        where: {
          id_projectId: {
            id: input.conversationId,
            projectId: input.projectId,
          },
          createdByUserId: ctx.session.user.id,
          deletedAt: null,
        },
        data: {
          title: input.title,
          renamedByUserAt: new Date(),
        },
      });

      return { conversation: serializeConversation(conversation) };
    }),

  submitFeedback: protectedProjectProcedureWithoutTracing
    .input(SubmitFeedbackInput)
    .mutation(async ({ ctx, input }) => {
      const projectAvailability = await assertInAppAgentAvailable({
        ctx,
        projectId: input.projectId,
      });

      await getOwnedConversationOrThrow({
        prisma: ctx.prisma,
        projectId: input.projectId,
        conversationId: input.conversationId,
        userId: ctx.session.user.id,
      });

      const messages = await getConversationMessages({
        prisma: ctx.prisma,
        projectId: input.projectId,
        conversationId: input.conversationId,
      });
      const targetMessage = messages.find(
        (message) => message.id === input.messageId,
      );

      if (
        targetMessage?.role !== "assistant" ||
        typeof targetMessage.content !== "string" ||
        targetMessage.content.length === 0
      ) {
        throw new InvalidRequestError(
          "Feedback can only be submitted for assistant text messages",
        );
      }

      if (targetMessage.runId !== input.runId) {
        throw new InvalidRequestError(
          "Feedback can only be submitted for persisted assistant messages",
        );
      }

      const comment = input.comment?.trim() ? input.comment.trim() : null;
      if (input.value === null) {
        return { feedback: null };
      }

      const scoreId = `afbs_${input.messageId}_${ctx.session.user.id}`;
      const now = new Date();
      const scoreProjectId = env.LANGFUSE_AI_FEATURES_PROJECT_ID;

      if (projectAvailability.aiTelemetryEnabled && scoreProjectId) {
        await upsertScore({
          id: scoreId,
          timestamp: convertDateToClickhouseDateTime(now),
          project_id: scoreProjectId,
          environment: IN_APP_AGENT_FEEDBACK_ENVIRONMENT,
          trace_id: getInAppAgentInstrumentationTraceId(input.runId),
          observation_id: getInAppAgentInstrumentationObservationId(
            input.runId,
          ),
          session_id: input.conversationId,
          name: IN_APP_AGENT_FEEDBACK_SCORE_NAME,
          value: input.value === "thumbs_up" ? 1 : 0,
          source: ScoreSourceEnum.ANNOTATION,
          comment,
          author_user_id: ctx.session.user.id,
          config_id: null,
          data_type: ScoreDataTypeEnum.BOOLEAN,
          string_value: input.value === "thumbs_up" ? "true" : "false",
          queue_id: null,
          created_at: convertDateToClickhouseDateTime(now),
          updated_at: convertDateToClickhouseDateTime(now),
          metadata: {
            project_id: input.projectId,
            conversation_id: input.conversationId,
            message_id: input.messageId,
          },
        });
      }

      return { feedback: { value: input.value, comment } };
    }),
});

/**
 * Approval requests from the persisted event stream that nobody has decided.
 *
 * The parent run's `AWAITING_APPROVAL` status is what makes an approval
 * actionable, but the request payload itself lives in the interrupt event —
 * which is also why the foreground side table can eventually go.
 */
function getPendingToolApprovals(
  events: readonly PersistedConversationEvent[],
  parkedRunIds: ReadonlySet<string>,
) {
  const decidedToolCallIds = new Set(
    events.flatMap((persisted) => {
      const decision = parseInAppAgentApprovalDecisionEvent(persisted.event);
      return decision ? [decision.toolCallId] : [];
    }),
  );

  return events.flatMap((persisted) => {
    const approvalRequest = parseInAppAgentInterruptEvent(persisted.event);

    // Actionable only while its run is still parked. Three paths end an
    // approval without writing a decision event — cancel
    // (`approval_cancelled`), a newer message (`approval_superseded`) and the
    // TTL (`approval_expired`) — so keying on events alone would leave a card
    // the user can click but nothing can consume.
    return approvalRequest &&
      parkedRunIds.has(persisted.runId) &&
      !decidedToolCallIds.has(approvalRequest.toolCallId)
      ? [{ runId: persisted.runId, approvalRequest }]
      : [];
  });
}

/**
 * Postgres and BullMQ are a dual write: the run is already committed as
 * QUEUED, so an enqueue failure must not leave a run nobody will ever
 * execute. Fail it right here with a typed, retryable code.
 *
 * A process death *between* the commit and this call is the one remaining
 * dispatch gap; reconciliation fails such a run at `QUEUE_TIMEOUT`
 * (dispatch option C). Re-enqueue-on-read is the pre-agreed follow-up.
 */
async function enqueueInAppAgentRun(params: {
  prisma: PrismaClient;
  projectId: string;
  runId: string;
}) {
  try {
    const queue = InAppAgentRunQueue.getInstance();

    if (!queue) {
      throw new Error("In-app agent run queue is unavailable");
    }

    await queue.add(
      QueueJobs.InAppAgentRunJob,
      {
        timestamp: new Date(),
        id: randomUUID(),
        name: QueueJobs.InAppAgentRunJob,
        payload: { projectId: params.projectId, runId: params.runId },
      },
      // Dedup lever: a duplicate enqueue is dropped by BullMQ, and a duplicate
      // delivery is a claim-CAS no-op anyway.
      { jobId: params.runId },
    );
  } catch (error) {
    logger.error("Failed to enqueue in-app agent run", {
      error,
      projectId: params.projectId,
      runId: params.runId,
    });

    await params.prisma.inAppAgentRun.updateMany({
      where: {
        id: params.runId,
        projectId: params.projectId,
        status: InAppAgentRunStatus.QUEUED,
      },
      data: {
        status: InAppAgentRunStatus.FAILED,
        finishedAt: new Date(),
        errorCode: InAppAgentRunErrorCode.ENQUEUE_FAILED,
        errorMessage: "Couldn't start the run",
      },
    });

    throw new BaseError(
      "InternalServerError",
      500,
      "Couldn't start the run. Try again.",
      true,
    );
  }
}

async function removeInAppAgentRunJob(runId: string) {
  try {
    await InAppAgentRunQueue.getInstance()?.remove(runId);
  } catch (error) {
    // Harmless: the claim CAS rejects a cancelled run anyway.
    logger.info("Failed to remove cancelled in-app agent run job", {
      error,
      runId,
    });
  }
}

async function assertInAppAgentAvailable({
  ctx,
  projectId,
}: {
  ctx: {
    session: {
      user: NonNullable<Session["user"]>;
    };
    prisma: PrismaClient;
  };
  projectId: string;
}) {
  if (!env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
    throw new BaseError(
      "PreconditionFailedError",
      412,
      "In-app agent is not available in this environment yet.",
      true,
    );
  }

  throwIfNoEntitlement({
    entitlement: "in-app-agent",
    sessionUser: ctx.session.user,
    projectId,
  });

  const project = await ctx.prisma.project.findUnique({
    where: { id: projectId },
    select: {
      organization: {
        select: {
          aiFeaturesEnabled: true,
          aiTelemetryEnabled: true,
        },
      },
    },
  });

  if (!project?.organization.aiFeaturesEnabled) {
    throw new ForbiddenError("Assistant is not enabled for this organization");
  }

  return {
    aiTelemetryEnabled: project.organization.aiTelemetryEnabled,
  };
}
