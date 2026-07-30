import { AbstractAgent, type RunAgentInput } from "@ag-ui/client";
import type { BaseEvent } from "@ag-ui/core";
import { Observable } from "rxjs";

import { InAppAgentRunStatus } from "@langfuse/shared";
import {
  InAppAgentWatchFrameSchema,
  type AgUiMessage,
  type AgUiRunAgentInput,
  type InAppAgentWatchFrame,
} from "@langfuse/shared/in-app-agent";

import { env } from "@/src/env.mjs";
import { parseSSEBuffer } from "@/src/hooks/useSSEDashboardQuery";
import { BackgroundExecutionConnectionError } from "./backgroundExecutionErrors";

export type InAppAgentRunStatusUpdate = Extract<
  InAppAgentWatchFrame,
  { type: "status" }
>;

const WATCH_RECONNECT_ATTEMPTS = 5;
const WATCH_RECONNECT_BASE_DELAY_MS = 500;

class InvalidWatchFrameError extends BackgroundExecutionConnectionError {
  constructor() {
    super("Assistant watch returned an invalid frame", { retryable: false });
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}

type StartRunFn = (params: {
  message: string;
  context: AgUiRunAgentInput["context"];
}) => Promise<{ runId: string }>;

// AG-UI's Zod v3 declarations resolve as unknown against this repo's Zod v4.
function asAgUiRunAgentInput(input: RunAgentInput): AgUiRunAgentInput {
  return input as unknown as AgUiRunAgentInput;
}

// AG-UI transport backed by a tRPC start mutation and persisted event tail.
export class InAppAgentBackgroundClient extends AbstractAgent {
  private readonly projectId: string;
  private readonly conversationId: string;
  private readonly startRun: StartRunFn;
  private onStatus?: (status: InAppAgentRunStatusUpdate) => void;
  private onCursor?: (cursor: number) => void;
  private cursor: number;
  private abortController = new AbortController();

  constructor(config: {
    projectId: string;
    conversationId: string;
    /** High-water `sequenceNumber` of the hydrated history. */
    cursor: number;
    startRun: StartRunFn;
    onStatus?: (status: InAppAgentRunStatusUpdate) => void;
    threadId?: string;
    initialMessages?: AgUiMessage[];
    initialState?: unknown;
  }) {
    super({
      threadId: config.threadId,
      initialMessages: config.initialMessages as never,
      initialState: config.initialState as never,
    });

    this.projectId = config.projectId;
    this.conversationId = config.conversationId;
    this.cursor = config.cursor;
    this.startRun = config.startRun;
    this.onStatus = config.onStatus;
  }

  run(input: RunAgentInput): Observable<BaseEvent> {
    return new Observable<BaseEvent>((subscriber) => {
      const controller = this.resetAbortController();

      const runInput = asAgUiRunAgentInput(input);
      const message = getLastUserMessageContent(runInput.messages);

      if (!message) {
        subscriber.error(new Error("A user message is required"));
        return;
      }

      this.startRun({ message, context: runInput.context })
        .then(({ runId }) => {
          this.onStatus?.({
            type: "status",
            runId,
            status: InAppAgentRunStatus.QUEUED,
            errorCode: null,
            cancelRequested: false,
          });
          return this.streamWithReconnects(subscriber, controller.signal);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) {
            subscriber.complete();
            return;
          }
          subscriber.error(error);
        });

      return () => {
        controller.abort();
      };
    });
  }

  connect(): Observable<BaseEvent> {
    return new Observable<BaseEvent>((subscriber) => {
      const controller = this.resetAbortController();

      this.streamWithReconnects(subscriber, controller.signal).catch(
        (error: unknown) => {
          if (controller.signal.aborted) {
            subscriber.complete();
            return;
          }
          subscriber.error(error);
        },
      );

      return () => {
        controller.abort();
      };
    });
  }

  // Stop observing without cancelling the server run.
  abortRun(): void {
    this.abortController.abort();
    super.abortRun();
  }

  // Hydration must set messages and cursor from the same persisted snapshot.
  setCursor(cursor: number): void {
    this.cursor = cursor;
  }

  setStatusListener(
    listener?: (status: InAppAgentRunStatusUpdate) => void,
  ): void {
    this.onStatus = listener;
  }

  setCursorListener(listener?: (cursor: number) => void): void {
    this.onCursor = listener;
  }

  private resetAbortController(): AbortController {
    this.abortController.abort();
    this.abortController = new AbortController();
    return this.abortController;
  }

  private async streamWithReconnects(
    subscriber: {
      next: (event: BaseEvent) => void;
      complete: () => void;
    },
    signal: AbortSignal,
  ): Promise<void> {
    let consecutiveFailures = 0;

    while (!signal.aborted) {
      const cursorBeforeRequest = this.cursor;
      let sawDoneFrame: boolean;

      try {
        sawDoneFrame = await this.streamOnce(subscriber, signal);
      } catch (error) {
        if (signal.aborted) {
          break;
        }

        if (
          error instanceof BackgroundExecutionConnectionError &&
          !error.retryable
        ) {
          throw error;
        }

        consecutiveFailures += 1;

        // Give up only once retrying has stopped looking like a blip;
        // the run itself keeps executing regardless of the browser.
        if (consecutiveFailures > WATCH_RECONNECT_ATTEMPTS) {
          throw new BackgroundExecutionConnectionError(getErrorMessage(error), {
            retryable: true,
            cause: error,
          });
        }

        await sleep(
          WATCH_RECONNECT_BASE_DELAY_MS * consecutiveFailures,
          signal,
        );
        continue;
      }

      if (sawDoneFrame) {
        subscriber.complete();
        return;
      }

      if (this.cursor !== cursorBeforeRequest) {
        consecutiveFailures = 0;
        continue;
      }

      consecutiveFailures += 1;
      if (consecutiveFailures > WATCH_RECONNECT_ATTEMPTS) {
        throw new BackgroundExecutionConnectionError(
          "Assistant watch closed repeatedly without progress",
          { retryable: true },
        );
      }

      await sleep(WATCH_RECONNECT_BASE_DELAY_MS * consecutiveFailures, signal);
    }

    subscriber.complete();
  }

  /** Returns whether the server signalled that there is nothing left to watch. */
  private async streamOnce(
    subscriber: { next: (event: BaseEvent) => void },
    signal: AbortSignal,
  ): Promise<boolean> {
    const basePath = env.NEXT_PUBLIC_BASE_PATH ?? "";
    const url = new URL(
      `${basePath}/api/in-app-agent/watch`,
      window.location.origin,
    );
    url.searchParams.set("projectId", this.projectId);
    url.searchParams.set("conversationId", this.conversationId);
    url.searchParams.set("cursor", String(this.cursor));

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "text/event-stream" },
      signal,
    });

    if (!response.ok) {
      const message = await readErrorMessage(response);
      if (
        response.status >= 400 &&
        response.status < 500 &&
        response.status !== 408 &&
        response.status !== 429
      ) {
        throw new BackgroundExecutionConnectionError(message, {
          retryable: false,
        });
      }
      throw new Error(message);
    }

    const reader = response.body?.getReader();

    if (!reader) {
      throw new Error("The assistant stream is unavailable");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (!signal.aborted) {
      const { done, value } = await reader.read();

      if (done) {
        return false;
      }

      buffer += decoder.decode(value, { stream: true });
      const { events, remaining } = parseSSEBuffer(buffer);
      buffer = remaining;

      for (const sseEvent of events) {
        let payload: unknown;
        try {
          payload = JSON.parse(sseEvent.data) as unknown;
        } catch {
          throw new InvalidWatchFrameError();
        }
        const frame = InAppAgentWatchFrameSchema.safeParse(payload);

        if (!frame.success) {
          throw new InvalidWatchFrameError();
        }

        if (frame.data.type === "done") {
          return true;
        }

        if (frame.data.type === "status") {
          // Run status is not an AG-UI event; it drives the drawer's own
          // "working" / failure rendering.
          this.onStatus?.(frame.data);
          continue;
        }

        if (frame.data.type === "error") {
          // A server-side tail failure, not a run failure. Reconnecting with
          // the cursor is the correct response.
          throw new Error(frame.data.message);
        }

        this.cursor = frame.data.sequenceNumber;
        this.onCursor?.(this.cursor);
        subscriber.next(frame.data.event as unknown as BaseEvent);
      }
    }

    return false;
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Assistant watch connection failed";
}

function getLastUserMessageContent(
  messages: AgUiRunAgentInput["messages"],
): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];

    if (message?.role === "user" && typeof message.content === "string") {
      return message.content;
    }
  }

  return undefined;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();

    if (
      body &&
      typeof body === "object" &&
      "error" in body &&
      typeof body.error === "string"
    ) {
      return body.error;
    }
  } catch {
    // Fall through to the generic message below.
  }

  return "The assistant is unavailable right now";
}
