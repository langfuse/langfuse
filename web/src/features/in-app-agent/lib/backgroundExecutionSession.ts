import type { AgentSubscriber } from "@ag-ui/client";

import {
  type AgUiContext,
  type AgUiMessage,
  type InAppAgentToolApprovalRequest,
  AgUiMessageSchema,
  InAppAgentRunErrorCode,
  InAppAgentRunStatus,
  parseInAppAgentInterruptEvent,
} from "@langfuse/shared/in-app-agent";
import { createInAppAgentMessageId } from "../ids";
import { BackgroundExecutionConnectionError } from "./backgroundExecutionErrors";
import {
  createInAppAgentDisplayState,
  recordInAppAgentMessagesForDisplay,
  recordInAppAgentToolCallForDisplay,
  type InAppAgentDisplayState,
} from "./display";

export type BackgroundExecutionRunCommand = {
  message: string;
  context: AgUiContext;
};

export type ApprovalDecision = {
  runId: string;
  toolCallId: string;
  approved: boolean;
  approvalScope?: "once" | "conversation";
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

type BackgroundExecutionAttachment =
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
  readonly conversationId: string;
  hydrateAndAttach(): Promise<void>;
  run(command: BackgroundExecutionRunCommand): Promise<void> | null;
  cancel(): Promise<void>;
  decide(input: ApprovalDecision): Promise<void>;
  detach(): void;
  dispose(): void;
  getSnapshot(): BackgroundExecutionView;
  subscribe(listener: () => void): () => void;
};

type BackgroundExecutionAgent = {
  threadId: string;
  messages: readonly unknown[];
  addMessage(message: AgUiMessage): void;
  setMessages(messages: AgUiMessage[]): void;
  subscribe(subscriber: AgentSubscriber): { unsubscribe(): void };
  runAgent(input: { context: AgUiContext }): Promise<unknown>;
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
  readonly conversationId: string;
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
    this.conversationId = config.agent.threadId;
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

  run(command: BackgroundExecutionRunCommand): Promise<void> | null {
    if (
      this.view.attachment.status === "attaching" ||
      this.view.attachment.status === "attached" ||
      (this.view.currentRun &&
        isCancellableBackgroundRun(this.view.currentRun.status))
    ) {
      return null;
    }

    return this.executeRun(command);
  }

  private async executeRun(
    command: BackgroundExecutionRunCommand,
  ): Promise<void> {
    const generation = ++this.attachGeneration;
    const userMessage = {
      id: createInAppAgentMessageId(),
      role: "user",
      content: command.message,
    } satisfies AgUiMessage;
    this.agent.addMessage(userMessage);
    if (!this.view.messages.some((message) => message.id === userMessage.id)) {
      this.observeMessages([...this.view.messages, userMessage]);
    }
    this.setView({
      ...this.view,
      currentRun: null,
      attachment: { status: "attached" },
    });

    try {
      await this.agent.runAgent({ context: command.context });
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

export function isCancellableBackgroundRun(
  status: InAppAgentRunStatus,
): boolean {
  return (
    status === InAppAgentRunStatus.QUEUED ||
    status === InAppAgentRunStatus.RUNNING ||
    status === InAppAgentRunStatus.AWAITING_APPROVAL
  );
}

const ASSISTANT_FAILED_CONTINUE =
  "The assistant failed. Send another message to continue.";
const ASSISTANT_FAILED_TRY_AGAIN =
  "The assistant failed. Send another message to try again.";

const BACKGROUND_RUN_FAILURE_MESSAGES: Readonly<Record<string, string>> = {
  [InAppAgentRunErrorCode.WORKER_LOST]: ASSISTANT_FAILED_CONTINUE,
  [InAppAgentRunErrorCode.STALE]: ASSISTANT_FAILED_CONTINUE,
  [InAppAgentRunErrorCode.QUEUE_TIMEOUT]: ASSISTANT_FAILED_CONTINUE,
  [InAppAgentRunErrorCode.WORKER_SHUTDOWN]: ASSISTANT_FAILED_CONTINUE,
  [InAppAgentRunErrorCode.OUTCOME_UNKNOWN]: ASSISTANT_FAILED_CONTINUE,
  [InAppAgentRunErrorCode.INIT_FAILED]: ASSISTANT_FAILED_TRY_AGAIN,
  [InAppAgentRunErrorCode.ENQUEUE_FAILED]: ASSISTANT_FAILED_TRY_AGAIN,
  [InAppAgentRunErrorCode.APPROVAL_EXPIRED]:
    "The approval request expired. The action was not run. Send another message if you still want it.",
  [InAppAgentRunErrorCode.RUN_TIMEOUT]:
    "The run hit the time limit. Send another message to continue.",
  [InAppAgentRunErrorCode.AGENT_ERROR]:
    "The assistant hit an error before finishing. Send another message to continue.",
  [InAppAgentRunErrorCode.APPROVAL_SUPERSEDED]: "Replaced by a newer message.",
  [InAppAgentRunErrorCode.APPROVAL_CANCELLED]: "Approval cancelled.",
  [InAppAgentRunErrorCode.CANCELLED]: "You stopped this run.",
};

function getBackgroundRunFailureMessage(errorCode: string | null): string {
  return (
    BACKGROUND_RUN_FAILURE_MESSAGES[errorCode ?? ""] ??
    "The run failed. Try again."
  );
}

type BackgroundRunNoticeTone = "info" | "warning";

export type BackgroundRunNotice = {
  text: string;
  tone: BackgroundRunNoticeTone;
};

const STEP_LIMIT_NOTICE =
  "The assistant had to stop before finishing this answer. Too many steps in one turn. Send another message to continue.";
const OUTPUT_LIMIT_NOTICE =
  "The assistant had to stop before finishing this answer. The response hit the model's output limit. Send another message to continue.";

/** Notices for SUCCEEDED runs cut short before a final answer, by error code. */
const TRUNCATION_NOTICES: Readonly<Record<string, string>> = {
  [InAppAgentRunErrorCode.STEP_LIMIT]: STEP_LIMIT_NOTICE,
  [InAppAgentRunErrorCode.OUTPUT_LIMIT]: OUTPUT_LIMIT_NOTICE,
};

/** A SUCCEEDED run that was cut short before producing a final answer. */
function isTruncatedRun(run: BackgroundExecutionRunView): boolean {
  return (
    run.status === InAppAgentRunStatus.SUCCEEDED &&
    !!run.errorCode &&
    run.errorCode in TRUNCATION_NOTICES
  );
}

export function getBackgroundRunNotice(
  run: BackgroundExecutionRunView | null,
): BackgroundRunNotice | null {
  if (!run) {
    return null;
  }

  if (isCancellableBackgroundRun(run.status) && run.cancelRequested) {
    return { text: "Stopping the run…", tone: "info" };
  }

  if (run.status === InAppAgentRunStatus.FAILED) {
    return {
      text: getBackgroundRunFailureMessage(run.errorCode ?? null),
      tone: "info",
    };
  }

  const truncationNotice = isTruncatedRun(run)
    ? TRUNCATION_NOTICES[run.errorCode ?? ""]
    : undefined;
  if (truncationNotice !== undefined) {
    return { text: truncationNotice, tone: "warning" };
  }

  return null;
}

export type SettledActivityOutcome = "worked" | "stopped" | "failed";

export function getSettledActivityOutcome(
  run: BackgroundExecutionRunView | null,
): SettledActivityOutcome {
  if (!run) {
    return "worked";
  }

  if (isTruncatedRun(run) || run.status === InAppAgentRunStatus.CANCELLED) {
    return "stopped";
  }

  if (run.status === InAppAgentRunStatus.FAILED) {
    return "failed";
  }

  return "worked";
}

function isExecutingRun(
  run: BackgroundExecutionRunView | null,
): run is BackgroundExecutionRunView {
  return (
    run?.status === InAppAgentRunStatus.QUEUED ||
    run?.status === InAppAgentRunStatus.RUNNING
  );
}
