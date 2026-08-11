import type { AbstractAgent, AgentSubscriber } from "@ag-ui/client";
import { z } from "zod";

import { InAppAgentRunErrorCode, InAppAgentRunStatus } from "@langfuse/shared";
import type {
  AgUiMessage,
  InAppAgentToolApprovalRequest,
} from "@langfuse/shared/in-app-agent";
import { AgUiMessageSchema } from "@langfuse/shared/in-app-agent";
import { BackgroundExecutionConnectionError } from "./backgroundExecutionErrors";
import {
  createInAppAgentDisplayState,
  recordInAppAgentMessagesForDisplay,
  recordInAppAgentToolCallForDisplay,
  type InAppAgentDisplayState,
} from "./display";

export type AgentInput = Parameters<AbstractAgent["runAgent"]>[0];

export type ApprovalDecision = {
  runId: string;
  toolCallId: string;
  approved: boolean;
};

export type BackgroundExecutionRunView = {
  id: string;
  status: InAppAgentRunStatus;
  errorCode: string | null;
  cancelRequested: boolean;
};

export type BackgroundExecutionApprovalView = {
  runId: string;
  approvalRequest: InAppAgentToolApprovalRequest;
  status: "pending" | "submitting";
};

export type BackgroundExecutionAttachment =
  | { status: "detached" }
  | { status: "attaching" }
  | { status: "attached" }
  | { status: "error"; error: unknown; retryable: boolean };

export type BackgroundExecutionView = {
  messages: AgUiMessage[];
  /**
   * Rendering sidecar for {@link messages}. Seeded from the hydrated snapshot
   * and advanced by live events, so the projection at render time sees the same
   * state the server built from the persisted log.
   */
  displayState: InAppAgentDisplayState;
  liveMessageRevision: number;
  eventCursor: number;
  currentRun: BackgroundExecutionRunView | null;
  pendingToolApprovals: BackgroundExecutionApprovalView[];
  cancelStatus: "idle" | "submitting";
  attachment: BackgroundExecutionAttachment;
};

export type BackgroundExecutionSession = {
  hydrateAndAttach(): Promise<void>;
  run(input: AgentInput): Promise<void>;
  cancel(): Promise<void>;
  decide(input: ApprovalDecision): Promise<void>;
  detach(): void;
  dispose(): void;
  getSnapshot(): BackgroundExecutionView;
  subscribe(listener: () => void): () => void;
};

type BackgroundExecutionAgent = {
  messages: readonly unknown[];
  setMessages(messages: AgUiMessage[]): void;
  subscribe(subscriber: AgentSubscriber): { unsubscribe(): void };
  runAgent(input: AgentInput): Promise<unknown>;
  connectAgent(): Promise<unknown>;
  abortRun(): void;
  setCursor(cursor: number): void;
  setStatusListener?(
    listener?: (status: {
      runId: string;
      status: InAppAgentRunStatus;
      errorCode?: string | null;
      cancelRequested?: boolean;
    }) => void,
  ): void;
  setCursorListener?(listener?: (cursor: number) => void): void;
};

type BackgroundExecutionHydration = Omit<
  BackgroundExecutionView,
  "attachment" | "cancelStatus" | "liveMessageRevision"
>;

type BackgroundExecutionAgentSubscriber = Pick<
  AgentSubscriber,
  | "onRunStartedEvent"
  | "onEvent"
  | "onMessagesChanged"
  | "onStateChanged"
  | "onToolCallResultEvent"
  | "onRunErrorEvent"
>;

export class BackgroundExecutionSessionController implements BackgroundExecutionSession {
  private readonly agent: BackgroundExecutionAgent;
  private readonly hydrate: () => Promise<BackgroundExecutionHydration>;
  private readonly cancelRun: (runId: string) => Promise<unknown>;
  private readonly decideApproval: (
    input: ApprovalDecision,
  ) => Promise<unknown>;
  private readonly onSettled?: () => void;
  private readonly onHydratedSnapshot?: (
    snapshot: BackgroundExecutionHydration,
  ) => void;
  private readonly onError?: (error: unknown) => void;
  private readonly agentSubscription: { unsubscribe(): void };
  private readonly listeners = new Set<() => void>();
  private view: BackgroundExecutionView;
  private attachGeneration = 0;
  private isReplacingMessages = false;

  constructor(config: {
    agent: BackgroundExecutionAgent;
    hydrate: () => Promise<BackgroundExecutionHydration>;
    cancelRun: (runId: string) => Promise<unknown>;
    decideApproval: (input: ApprovalDecision) => Promise<unknown>;
    subscriber?: BackgroundExecutionAgentSubscriber;
    onSettled?: () => void;
    /**
     * A durable snapshot has replaced the local message list, so every
     * completed tool call it contains is authoritative regardless of run
     * status. Fires on every hydration, so the consumer must be idempotent.
     */
    onHydratedSnapshot?: (snapshot: BackgroundExecutionHydration) => void;
    onError?: (error: unknown) => void;
    initialView?: Partial<BackgroundExecutionView>;
  }) {
    this.agent = config.agent;
    this.hydrate = config.hydrate;
    this.cancelRun = config.cancelRun;
    this.decideApproval = config.decideApproval;
    this.onSettled = config.onSettled;
    this.onHydratedSnapshot = config.onHydratedSnapshot;
    this.onError = config.onError;
    this.view = {
      messages: [],
      displayState: createInAppAgentDisplayState(),
      liveMessageRevision: 0,
      eventCursor: -1,
      currentRun: null,
      pendingToolApprovals: [],
      cancelStatus: "idle",
      attachment: { status: "detached" },
      ...config.initialView,
    };
    this.agent.setStatusListener?.((status) => {
      const currentRun = {
        id: status.runId,
        status: status.status,
        errorCode: status.errorCode ?? null,
        cancelRequested: status.cancelRequested === true,
      };
      const hasSettled = !isExecutingRun(currentRun);

      this.setView({
        ...this.view,
        currentRun,
        attachment: hasSettled ? { status: "detached" } : this.view.attachment,
      });
      if (hasSettled) {
        // Status follows all persisted events and is authoritative even if the
        // transport stalls before its final `done` frame.
        this.agent.abortRun();
        this.onSettled?.();
      }
    });
    this.agent.setCursorListener?.((eventCursor) => {
      this.setView({ ...this.view, eventCursor });
    });
    this.agentSubscription = this.agent.subscribe({
      ...config.subscriber,
      onMessagesChanged: (params) => {
        if (!this.isReplacingMessages) {
          this.observeMessages(params.messages);
          return config.subscriber?.onMessagesChanged?.(params);
        }
      },
      onStateChanged: (params) => {
        if (!this.isReplacingMessages) {
          this.observeMessages(params.messages);
          return config.subscriber?.onStateChanged?.(params);
        }
      },
      onCustomEvent: ({ event }) => {
        const approvalRequest = parseInAppAgentInterruptEvent(event);
        if (approvalRequest) {
          this.observeApproval({
            runId: approvalRequest.runId,
            approvalRequest,
            status: "pending",
          });
        }
      },
      onToolCallResultEvent: async (params) => {
        this.resolveApproval(params.event.toolCallId);
        return config.subscriber?.onToolCallResultEvent?.(params);
      },
    });
  }

  async hydrateAndAttach(): Promise<void> {
    if (
      this.view.attachment.status === "attaching" ||
      this.view.attachment.status === "attached"
    ) {
      return;
    }

    const generation = ++this.attachGeneration;
    this.setView({ ...this.view, attachment: { status: "attaching" } });

    try {
      const replaced = await this.replaceWithHydratedSnapshot(generation);
      if (!replaced) {
        return;
      }

      if (!isExecutingRun(this.view.currentRun)) {
        return;
      }

      this.setView({ ...this.view, attachment: { status: "attached" } });
      this.observeExecution(this.agent.connectAgent(), generation);
    } catch (error) {
      if (generation !== this.attachGeneration) {
        return;
      }

      this.setAttachmentError(error);
      throw error;
    }
  }

  async run(input: AgentInput): Promise<void> {
    if (
      this.view.attachment.status === "attaching" ||
      this.view.attachment.status === "attached"
    ) {
      return;
    }

    const generation = ++this.attachGeneration;
    this.setView({
      ...this.view,
      currentRun: null,
      attachment: { status: "attached" },
    });

    try {
      await this.agent.runAgent(input);
    } catch (error) {
      if (generation !== this.attachGeneration) {
        return;
      }

      if (error instanceof BackgroundExecutionConnectionError) {
        this.setAttachmentError(error);
      } else {
        this.setView({
          ...this.view,
          attachment: { status: "detached" },
        });
      }
      this.onError?.(error);
      this.onSettled?.();
      throw error;
    }

    await this.convergeAfterExecution(generation);
  }

  async cancel(): Promise<void> {
    const run = this.view.currentRun;
    if (!run || !isCancellableBackgroundRun(run.status)) {
      return;
    }

    const attachmentGeneration = this.attachGeneration;
    this.setView({ ...this.view, cancelStatus: "submitting" });
    try {
      await this.cancelRun(run.id);
    } catch (error) {
      this.setView({ ...this.view, cancelStatus: "idle" });
      throw error;
    }
    // The watch stream may have delivered a fresher status while the mutation
    // was in flight; only stamp the cancellation onto the same run.
    const currentRun = this.view.currentRun;
    this.setView({
      ...this.view,
      currentRun:
        currentRun?.id === run.id
          ? { ...currentRun, cancelRequested: true }
          : currentRun,
      cancelStatus: "idle",
    });
    await this.refreshAttachmentAfterCommand(attachmentGeneration);
  }

  async decide(input: ApprovalDecision): Promise<void> {
    const attachmentGeneration = this.attachGeneration;
    this.setApprovalStatus(input.toolCallId, "submitting");
    try {
      await this.decideApproval(input);
    } catch (error) {
      this.setApprovalStatus(input.toolCallId, "pending");
      throw error;
    }
    this.resolveApproval(input.toolCallId);
    await this.refreshAttachmentAfterCommand(attachmentGeneration);
  }

  detach(): void {
    this.attachGeneration += 1;
    this.agent.abortRun();
    this.setView({ ...this.view, attachment: { status: "detached" } });
  }

  dispose(): void {
    this.detach();
    this.agentSubscription.unsubscribe();
    this.agent.setStatusListener?.(undefined);
    this.agent.setCursorListener?.(undefined);
    this.listeners.clear();
  }

  getSnapshot(): BackgroundExecutionView {
    return this.view;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private observeMessages(messages: readonly unknown[]): void {
    const parsedMessages = messages.flatMap((message) => {
      const parsed = AgUiMessageSchema.safeParse(message);
      return parsed.success ? [parsed.data] : [];
    });
    let displayState = recordInAppAgentMessagesForDisplay(
      this.view.displayState,
      parsedMessages,
    );
    for (const message of parsedMessages) {
      if (message.role !== "assistant") {
        continue;
      }
      for (const toolCall of message.toolCalls ?? []) {
        displayState = recordInAppAgentToolCallForDisplay(
          displayState,
          toolCall.id,
          message.id,
        );
      }
    }
    this.setView({
      ...this.view,
      messages: parsedMessages,
      displayState,
      liveMessageRevision: this.view.liveMessageRevision + 1,
    });
  }

  private observeApproval(approval: BackgroundExecutionApprovalView): void {
    const pendingToolApprovals = this.view.pendingToolApprovals.filter(
      (pending) =>
        pending.approvalRequest.toolCallId !==
        approval.approvalRequest.toolCallId,
    );
    this.setView({
      ...this.view,
      pendingToolApprovals: [...pendingToolApprovals, approval],
    });
  }

  private resolveApproval(toolCallId: string): void {
    this.setView({
      ...this.view,
      pendingToolApprovals: this.view.pendingToolApprovals.filter(
        (pending) => pending.approvalRequest.toolCallId !== toolCallId,
      ),
    });
  }

  private setApprovalStatus(
    toolCallId: string,
    status: BackgroundExecutionApprovalView["status"],
  ): void {
    this.setView({
      ...this.view,
      pendingToolApprovals: this.view.pendingToolApprovals.map((pending) =>
        pending.approvalRequest.toolCallId === toolCallId
          ? { ...pending, status }
          : pending,
      ),
    });
  }

  private observeExecution(
    execution: Promise<unknown>,
    generation: number,
  ): void {
    execution.then(
      () => this.convergeAfterExecution(generation),
      (error: unknown) => {
        if (generation !== this.attachGeneration) {
          return;
        }

        this.setAttachmentError(error);
        this.onError?.(error);
      },
    );
  }

  private async convergeAfterExecution(generation: number): Promise<void> {
    if (generation !== this.attachGeneration) {
      return;
    }

    try {
      await this.replaceWithHydratedSnapshot(generation);
    } catch (error) {
      if (generation !== this.attachGeneration) {
        return;
      }

      const connectionError =
        error instanceof BackgroundExecutionConnectionError
          ? error
          : new BackgroundExecutionConnectionError(
              "Failed to refresh the completed assistant transcript",
              { retryable: true, cause: error },
            );
      this.setAttachmentError(connectionError);
      this.onError?.(connectionError);
    } finally {
      if (generation === this.attachGeneration) {
        this.onSettled?.();
      }
    }
  }

  private async replaceWithHydratedSnapshot(
    generation: number,
  ): Promise<boolean> {
    const hydrated = await this.hydrate();

    if (generation !== this.attachGeneration) {
      return false;
    }

    this.isReplacingMessages = true;
    try {
      this.agent.setMessages(hydrated.messages);
    } finally {
      this.isReplacingMessages = false;
    }
    this.agent.setCursor(hydrated.eventCursor);
    this.setView({
      ...hydrated,
      liveMessageRevision: this.view.liveMessageRevision,
      cancelStatus: "idle",
      attachment: { status: "detached" },
    });

    this.onHydratedSnapshot?.(hydrated);

    return true;
  }

  private async refreshAttachmentAfterCommand(
    attachmentGeneration: number,
  ): Promise<void> {
    if (attachmentGeneration !== this.attachGeneration) {
      return;
    }

    this.detach();
    try {
      await this.hydrateAndAttach();
      if (!isExecutingRun(this.view.currentRun)) {
        // A terminal snapshot does not attach a watch whose convergence could
        // otherwise publish the settled lifecycle notification.
        this.onSettled?.();
      }
    } catch {
      // The durable command already succeeded. Attachment failures are exposed
      // through the session snapshot and must not change the command outcome.
    }
  }

  private setAttachmentError(error: unknown): void {
    this.setView({
      ...this.view,
      attachment: {
        status: "error",
        error,
        retryable:
          error instanceof BackgroundExecutionConnectionError &&
          error.retryable,
      },
    });
  }

  private setView(view: BackgroundExecutionView): void {
    this.view = view;
    this.listeners.forEach((listener) => {
      listener();
    });
  }
}

const MastraSuspendEventSchema = z.object({
  type: z.literal("mastra_suspend"),
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  args: z.unknown().optional(),
  runId: z.string().min(1),
});

export function parseInAppAgentInterruptEvent(
  event: unknown,
): InAppAgentToolApprovalRequest | null {
  if (
    !event ||
    typeof event !== "object" ||
    !("name" in event) ||
    event.name !== "on_interrupt"
  ) {
    return null;
  }

  const value = "value" in event ? event.value : undefined;
  const parsedValue = typeof value === "string" ? parseJson(value) : value;
  const interrupt = MastraSuspendEventSchema.safeParse(parsedValue);

  return interrupt.success
    ? {
        type: "tool_approval_request",
        toolCallId: interrupt.data.toolCallId,
        toolName: interrupt.data.toolName,
        args: interrupt.data.args,
        runId: interrupt.data.runId,
      }
    : null;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

export function isCancellableBackgroundRun(
  status: InAppAgentRunStatus,
): boolean {
  return (
    status === InAppAgentRunStatus.QUEUED ||
    status === InAppAgentRunStatus.RUNNING ||
    status === InAppAgentRunStatus.AWAITING_APPROVAL
  );
}

export function getBackgroundRunFailureMessage(
  errorCode: string | null,
): string {
  return (
    BACKGROUND_RUN_FAILURE_MESSAGES[errorCode ?? ""] ??
    "The run failed. Try again."
  );
}

const BACKGROUND_RUN_FAILURE_MESSAGES: Readonly<Record<string, string>> = {
  [InAppAgentRunErrorCode.ENQUEUE_FAILED]: "Couldn't start the run. Try again.",
  [InAppAgentRunErrorCode.QUEUE_TIMEOUT]:
    "No worker picked this up. Try again.",
  [InAppAgentRunErrorCode.WORKER_LOST]: "The run was interrupted. Try again.",
  [InAppAgentRunErrorCode.STALE]: "The run was interrupted. Try again.",
  [InAppAgentRunErrorCode.RUN_TIMEOUT]:
    "The run exceeded the maximum duration.",
  [InAppAgentRunErrorCode.WORKER_SHUTDOWN]:
    "The run was interrupted by a deploy. Try again.",
  [InAppAgentRunErrorCode.OUTCOME_UNKNOWN]:
    "The approved action may have completed. Verify before retrying.",
  [InAppAgentRunErrorCode.APPROVAL_EXPIRED]: "The approval request expired.",
  [InAppAgentRunErrorCode.APPROVAL_SUPERSEDED]: "Replaced by a newer message.",
  [InAppAgentRunErrorCode.APPROVAL_CANCELLED]: "Approval cancelled.",
  [InAppAgentRunErrorCode.CANCELLED]: "You stopped this run.",
};

function isExecutingRun(
  run: BackgroundExecutionRunView | null,
): run is BackgroundExecutionRunView {
  return (
    run?.status === InAppAgentRunStatus.QUEUED ||
    run?.status === InAppAgentRunStatus.RUNNING
  );
}
