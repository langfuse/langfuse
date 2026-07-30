import type { AbstractAgent, AgentSubscriber } from "@ag-ui/client";
import { z } from "zod";

import { InAppAgentRunErrorCode, InAppAgentRunStatus } from "@langfuse/shared";
import type {
  AgUiMessage,
  InAppAgentToolApprovalRequest,
} from "@langfuse/shared/in-app-agent";
import { AgUiMessageSchema } from "@langfuse/shared/in-app-agent";
import { BackgroundExecutionConnectionError } from "./backgroundExecutionErrors";

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
};

export type BackgroundExecutionAttachment =
  | { status: "detached" }
  | { status: "attaching" }
  | { status: "attached" }
  | { status: "error"; error: unknown; retryable: boolean };

export type BackgroundExecutionView = {
  messages: AgUiMessage[];
  liveMessageRevision: number;
  eventCursor: number;
  currentRun: BackgroundExecutionRunView | null;
  pendingToolApprovals: BackgroundExecutionApprovalView[];
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
  "attachment" | "liveMessageRevision"
>;

type BackgroundExecutionAgentSubscriber = Pick<
  AgentSubscriber,
  "onRunStartedEvent" | "onEvent" | "onToolCallResultEvent" | "onRunErrorEvent"
>;

export class BackgroundExecutionSessionController implements BackgroundExecutionSession {
  private readonly agent: BackgroundExecutionAgent;
  private readonly hydrate: () => Promise<BackgroundExecutionHydration>;
  private readonly cancelRun: (runId: string) => Promise<unknown>;
  private readonly decideApproval: (
    input: ApprovalDecision,
  ) => Promise<unknown>;
  private readonly onSettled?: () => void;
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
    onError?: (error: unknown) => void;
    initialView?: Partial<BackgroundExecutionView>;
  }) {
    this.agent = config.agent;
    this.hydrate = config.hydrate;
    this.cancelRun = config.cancelRun;
    this.decideApproval = config.decideApproval;
    this.onSettled = config.onSettled;
    this.onError = config.onError;
    this.view = {
      messages: [],
      liveMessageRevision: 0,
      eventCursor: -1,
      currentRun: null,
      pendingToolApprovals: [],
      attachment: { status: "detached" },
      ...config.initialView,
    };
    this.agent.setStatusListener?.((status) => {
      this.setView({
        ...this.view,
        currentRun: {
          id: status.runId,
          status: status.status,
          errorCode: status.errorCode ?? null,
          cancelRequested: status.cancelRequested === true,
        },
      });
    });
    this.agent.setCursorListener?.((eventCursor) => {
      this.setView({ ...this.view, eventCursor });
    });
    this.agentSubscription = this.agent.subscribe({
      ...config.subscriber,
      onMessagesChanged: ({ messages }) => {
        if (!this.isReplacingMessages) {
          this.observeMessages(messages);
        }
      },
      onStateChanged: ({ messages }) => {
        if (!this.isReplacingMessages) {
          this.observeMessages(messages);
        }
      },
      onCustomEvent: ({ event }) => {
        const approvalRequest = parseInAppAgentInterruptEvent(event);
        if (approvalRequest) {
          this.observeApproval({
            runId: approvalRequest.runId,
            approvalRequest,
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

    await this.cancelRun(run.id);
    this.setView({
      ...this.view,
      currentRun: { ...run, cancelRequested: true },
    });
    await this.hydrateAndAttach();
  }

  async decide(input: ApprovalDecision): Promise<void> {
    await this.decideApproval(input);
    this.detach();
    await this.hydrateAndAttach();
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
    this.setView({
      ...this.view,
      messages: messages.flatMap((message) => {
        const parsed = AgUiMessageSchema.safeParse(message);
        return parsed.success ? [parsed.data] : [];
      }),
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
      attachment: { status: "detached" },
    });

    return true;
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
