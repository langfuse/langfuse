import type { AbstractAgent } from "@ag-ui/client";

import { InAppAgentRunErrorCode, InAppAgentRunStatus } from "@langfuse/shared";
import type {
  AgUiMessage,
  InAppAgentToolApprovalRequest,
} from "@langfuse/shared/in-app-agent";

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

export type BackgroundExecutionView = {
  messages: AgUiMessage[];
  eventCursor: number;
  currentRun: BackgroundExecutionRunView | null;
  pendingToolApprovals: BackgroundExecutionApprovalView[];
  isAttached: boolean;
};

export type BackgroundExecutionSession = {
  hydrateAndAttach(): Promise<void>;
  run(input: AgentInput): Promise<void>;
  cancel(): Promise<void>;
  decide(input: ApprovalDecision): Promise<void>;
  detach(): void;
  getSnapshot(): BackgroundExecutionView;
  subscribe(listener: () => void): () => void;
};

type BackgroundExecutionAgent = {
  setMessages(messages: AgUiMessage[]): void;
  setCursor(cursor: number): void;
  runAgent(input: AgentInput): Promise<unknown>;
  connectAgent(): Promise<unknown>;
  abortRun(): void;
  setStatusListener?(
    listener: (status: {
      runId: string;
      status: InAppAgentRunStatus;
      errorCode?: string | null;
      cancelRequested?: boolean;
    }) => void,
  ): void;
};

export class BackgroundExecutionSessionController implements BackgroundExecutionSession {
  private readonly agent: BackgroundExecutionAgent;
  private readonly hydrate: () => Promise<
    Omit<BackgroundExecutionView, "isAttached">
  >;
  private readonly cancelRun: (runId: string) => Promise<unknown>;
  private readonly decideApproval: (
    input: ApprovalDecision,
  ) => Promise<unknown>;
  private readonly onSettled?: () => void;
  private readonly onError?: (error: unknown) => void;
  private readonly listeners = new Set<() => void>();
  private view: BackgroundExecutionView;
  private attachGeneration = 0;
  private attachInFlight = false;

  constructor(config: {
    agent: BackgroundExecutionAgent;
    hydrate: () => Promise<Omit<BackgroundExecutionView, "isAttached">>;
    cancelRun: (runId: string) => Promise<unknown>;
    decideApproval: (input: ApprovalDecision) => Promise<unknown>;
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
      eventCursor: -1,
      currentRun: null,
      pendingToolApprovals: [],
      isAttached: false,
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
  }

  async hydrateAndAttach(): Promise<void> {
    if (this.attachInFlight || this.view.isAttached) {
      return;
    }

    this.attachInFlight = true;
    const generation = ++this.attachGeneration;
    this.setView({ ...this.view, isAttached: true });

    try {
      const hydrated = await this.hydrate();

      if (generation !== this.attachGeneration) {
        return;
      }

      this.agent.setMessages(hydrated.messages);
      this.agent.setCursor(hydrated.eventCursor);
      this.setView({ ...hydrated, isAttached: false });

      if (!isExecutingRun(hydrated.currentRun)) {
        return;
      }

      this.setView({ ...this.view, isAttached: true });
      this.observeExecution(this.agent.connectAgent(), generation);
    } catch (error) {
      if (generation === this.attachGeneration) {
        this.setView({ ...this.view, isAttached: false });
      }
      throw error;
    } finally {
      if (generation === this.attachGeneration) {
        this.attachInFlight = false;
      }
    }
  }

  async run(input: AgentInput): Promise<void> {
    if (this.view.isAttached) {
      return;
    }

    const generation = ++this.attachGeneration;
    this.setView({ ...this.view, currentRun: null, isAttached: true });

    try {
      await this.agent.runAgent(input);
    } catch (error) {
      this.onError?.(error);
      throw error;
    } finally {
      if (generation === this.attachGeneration) {
        this.setView({ ...this.view, isAttached: false });
        this.onSettled?.();
      }
    }
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
    await this.hydrateAndAttach();
  }

  detach(): void {
    this.attachGeneration += 1;
    this.attachInFlight = false;
    this.agent.abortRun();
    this.setView({ ...this.view, isAttached: false });
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

  observeMessages(messages: AgUiMessage[]): void {
    this.setView({ ...this.view, messages });
  }

  observeApproval(approval: BackgroundExecutionApprovalView): void {
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

  resolveApproval(toolCallId: string): void {
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
    execution
      .catch((error: unknown) => this.onError?.(error))
      .finally(() => {
        if (generation !== this.attachGeneration) {
          return;
        }

        this.setView({ ...this.view, isAttached: false });
        this.onSettled?.();
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
