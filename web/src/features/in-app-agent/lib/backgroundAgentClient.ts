import { AbstractAgent, type RunAgentInput } from "@ag-ui/client";
import type { BaseEvent } from "@ag-ui/core";
import { Observable } from "rxjs";

import {
  InAppAgentWatchFrameSchema,
  type AgUiMessage,
  type AgUiRunAgentInput,
  type InAppAgentWatchFrame,
} from "@langfuse/shared/in-app-agent";

import { env } from "@/src/env.mjs";
import { parseSSEBuffer } from "@/src/hooks/useSSEDashboardQuery";

export type InAppAgentRunStatusUpdate = Extract<
  InAppAgentWatchFrame,
  { type: "status" }
>;

const WATCH_RECONNECT_ATTEMPTS = 5;
const WATCH_RECONNECT_BASE_DELAY_MS = 500;

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

// @ag-ui/client publishes Zod v3-shaped declarations while this repo is on Zod
// v4, so its RunAgentInput members resolve as unknown. Read the run input
// through the locally-mirrored schema types instead (same reason
// packages/shared/src/in-app-agent/schema.ts duplicates them).
function asAgUiRunAgentInput(input: RunAgentInput): AgUiRunAgentInput {
  return input as unknown as AgUiRunAgentInput;
}

/**
 * AG-UI transport for background-executed runs.
 *
 * The whole point of subclassing `AbstractAgent` here is that nothing
 * downstream has to change: `runAgent()` still pipes through
 * `transformChunks`, `verifyEvents`, `apply` and the drawer's subscribers, so
 * message reduction, smooth streaming and the tool cards are shared with the
 * foreground path byte for byte. Only the transport differs — instead of
 * POSTing and reading the response stream, we submit through a tRPC mutation
 * and read the conversation's persisted event tail.
 *
 * - `run()` submits the turn, then tails from the pre-submit cursor.
 * - `connect()` only tails. This is AG-UI's own seam for re-attaching to an
 *   in-flight run, which is exactly what a page refresh mid-turn needs.
 *
 * Reconnects are the designed path, not an error path: the server ends every
 * stream deliberately well inside the route's duration limit, and any close
 * that was not preceded by a `done` frame is retried with the cursor. Cold
 * start, refresh and reconnect are one code path.
 */
export class InAppAgentBackgroundClient extends AbstractAgent {
  private readonly projectId: string;
  private readonly conversationId: string;
  private readonly startRun: StartRunFn;
  private readonly onStatus?: (status: InAppAgentRunStatusUpdate) => void;
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
        .then(() => this.streamWithReconnects(subscriber, controller.signal))
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

  /**
   * Stop watching. Cancelling the *run* is a separate server-side mutation:
   * a background run keeps going whether or not a browser is attached, which
   * is the whole feature.
   */
  abortRun(): void {
    this.abortController.abort();
    super.abortRun();
  }

  /**
   * Re-point the tail at a persisted high-water mark.
   *
   * Called at every attach boundary (drawer opened, conversation re-selected,
   * approval decided) together with `setMessages`, so the transcript the client
   * renders and the cursor it tails from always come from the same persisted
   * snapshot. Letting those two drift is what makes an attach look like the
   * model re-generating history.
   */
  setCursor(cursor: number): void {
    this.cursor = cursor;
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
      try {
        const sawDoneFrame = await this.streamOnce(subscriber, signal);

        if (sawDoneFrame) {
          subscriber.complete();
          return;
        }

        // A clean close without a done frame is the deliberate
        // max-connection end: reconnect immediately, nothing went wrong.
        consecutiveFailures = 0;
      } catch (error) {
        if (signal.aborted) {
          break;
        }

        consecutiveFailures += 1;

        // Give up only once retrying has stopped looking like a blip;
        // the run itself keeps executing regardless of the browser.
        if (consecutiveFailures > WATCH_RECONNECT_ATTEMPTS) {
          throw error;
        }

        await sleep(
          WATCH_RECONNECT_BASE_DELAY_MS * consecutiveFailures,
          signal,
        );
      }
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
      throw new Error(await readErrorMessage(response));
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
        const payload: unknown = JSON.parse(sseEvent.data);
        const frame = InAppAgentWatchFrameSchema.safeParse(payload);

        if (!frame.success) {
          continue;
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
        subscriber.next(frame.data.event as unknown as BaseEvent);
      }
    }

    return false;
  }
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
