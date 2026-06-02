import { EventType } from "@ag-ui/core";
import { ClaudeAgentAdapter } from "@ag-ui/claude-agent-sdk";
import { z } from "zod";

import type {
  AgUiCustomEvent,
  AgUiEvent,
  AgUiRunAgentInput,
} from "@/src/features/in-app-agent/schema";
import { logger } from "@langfuse/shared/src/server";

const ASSISTANT_TITLE = "Langfuse Assistant";
const ASSISTANT_SYSTEM_PROMPT = [
  "You are the persistent in-app assistant for Langfuse.",
  "Be concise, factual, and useful.",
  "If you are not confident in the answer, say that directly instead of guessing.",
  "Use markdown when it improves clarity.",
].join(" ");
const MAX_AGENT_BUDGET_USD = 5;

type CreateAgUiStreamOptions = {
  resumeSessionId?: string;
  onResumeSessionId: (sessionId: string) => unknown;
  onEvent?: (event: AgUiEvent) => void | Promise<void>;
  onComplete?: () => void | Promise<void>;
  onAbort?: () => void | Promise<void>;
  onError?: (error: unknown) => void | Promise<void>;
  onFinish?: () => void | Promise<void>;
  awsBedrock: {
    region?: string;
    profile?: string;
  };
  langfuseMcp: {
    url: string;
    publicKey: string;
    secretKey: string;
  };
};

export function createAgUiStream(params: {
  input: AgUiRunAgentInput;
  signal: AbortSignal;
  options: CreateAgUiStreamOptions;
}) {
  const encoder = new TextEncoder();
  const awsProfile =
    process.env.AWS_PROFILE ?? params.options.awsBedrock.profile;
  const awsSdkLoadConfig =
    process.env.AWS_SDK_LOAD_CONFIG ?? (awsProfile ? "1" : undefined);

  const langfuseMcpAuthHeader = `Basic ${Buffer.from(
    `${params.options.langfuseMcp.publicKey}:${params.options.langfuseMcp.secretKey}`,
  ).toString("base64")}`;

  const adapter = new ClaudeAgentAdapter({
    permissionMode: "dontAsk",
    title: ASSISTANT_TITLE,
    systemPrompt: ASSISTANT_SYSTEM_PROMPT,
    allowedTools: ["mcp__langfuse__*"],
    mcpServers: {
      langfuse: {
        type: "http",
        url: params.options.langfuseMcp.url,
        headers: {
          Authorization: langfuseMcpAuthHeader,
        },
      },
    },
    settingSources: [],
    additionalDirectories: [],
    maxBudgetUsd: MAX_AGENT_BUDGET_USD,
    env: {
      CLAUDE_CODE_USE_BEDROCK: "1",
      CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: "1",
      ...(params.options.awsBedrock.region
        ? {
            AWS_DEFAULT_REGION: params.options.awsBedrock.region,
            AWS_REGION: params.options.awsBedrock.region,
          }
        : {}),
      ...(awsProfile ? { AWS_PROFILE: awsProfile } : {}),
      ...(awsSdkLoadConfig ? { AWS_SDK_LOAD_CONFIG: awsSdkLoadConfig } : {}),
    },
    includePartialMessages: true,
    model: "haiku",
  });

  const adapterInput = params.options.resumeSessionId
    ? {
        ...params.input,
        forwardedProps: {
          ...(z
            .record(z.string(), z.unknown())
            .safeParse(params.input.forwardedProps).data ?? {}),
          resume: params.options.resumeSessionId,
        },
      }
    : params.input;

  let subscription: { unsubscribe: () => void } | undefined;
  let ending = false;
  let closed = false;
  let finished = false;
  let abortHandler: (() => void) | undefined;
  let eventQueue = Promise.resolve();

  const removeAbortHandler = () => {
    if (!abortHandler) {
      return;
    }

    params.signal.removeEventListener("abort", abortHandler);
    abortHandler = undefined;
  };

  const finish = () => {
    if (finished) {
      return;
    }

    finished = true;
    try {
      void eventQueue
        .then(() => params.options.onFinish?.())
        .catch((error) => {
          logger.error("Error in agent stream cleanup", {
            error,
            runId: params.input.runId,
            threadId: params.input.threadId,
          });
        });
    } catch (error) {
      logger.error("Error in agent stream cleanup", {
        error,
        runId: params.input.runId,
        threadId: params.input.threadId,
      });
    }
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      let streamedRunError: string | null = null;
      let streamedRunErrorHandled = false;

      const runTerminalCallback = async (
        callback: (() => void | Promise<void>) | undefined,
        errorContext: string,
      ) => {
        try {
          await callback?.();
        } catch (error) {
          logger.error(errorContext, {
            error,
            runId: params.input.runId,
            threadId: params.input.threadId,
          });
        }
      };

      const failStream = (error: unknown, eventType?: string) => {
        if (closed) {
          return;
        }

        ending = true;
        closed = true;
        removeAbortHandler();
        subscription?.unsubscribe();
        adapter.interrupt().catch(() => undefined);

        logger.error("Failed to persist in-app agent event", {
          error,
          runId: params.input.runId,
          threadId: params.input.threadId,
          eventType,
        });

        void runTerminalCallback(
          () => params.options.onError?.(error),
          "Error while marking agent stream as failed",
        ).finally(finish);

        controller.error(error);
      };

      const enqueueEvent = (
        agUiEvent: AgUiEvent,
        afterPersist?: () => void | Promise<void>,
      ) => {
        eventQueue = eventQueue
          .then(async () => {
            if (closed) {
              return;
            }

            await params.options.onEvent?.(agUiEvent);
            await afterPersist?.();

            if (closed) {
              return;
            }

            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(agUiEvent)}\n\n`),
            );
          })
          .catch((error) => failStream(error, String(agUiEvent.type)));
      };

      const handleStreamedRunError = () => {
        if (streamedRunError === null || streamedRunErrorHandled) {
          return;
        }

        streamedRunErrorHandled = true;
        return params.options.onError?.(new Error(streamedRunError));
      };

      const closeController = (
        terminalCallback?: () => void | Promise<void>,
      ) => {
        if (ending || closed) {
          return;
        }

        ending = true;
        removeAbortHandler();
        void eventQueue
          .then(async () => {
            if (closed) {
              return;
            }

            await terminalCallback?.();

            if (closed) {
              return;
            }

            closed = true;
            controller.close();
          })
          .catch((error) => failStream(error))
          .finally(finish);
      };

      const abort = () => {
        if (ending || closed) {
          return;
        }

        ending = true;
        closed = true;
        removeAbortHandler();
        void runTerminalCallback(
          () => params.options.onAbort?.(),
          "Error while marking agent stream as aborted",
        ).finally(finish);
        adapter.interrupt().catch(() => undefined);
        controller.close();
      };

      abortHandler = () => {
        subscription?.unsubscribe();
        abort();
      };

      if (params.signal.aborted) {
        abort();
        return;
      }

      params.signal.addEventListener("abort", abortHandler, { once: true });

      subscription = adapter.run(adapterInput).subscribe({
        next(event) {
          if (ending || closed) {
            return;
          }

          if (params.signal.aborted) {
            abort();
            return;
          }

          for (const agUiEvent of normalizeAdapterEvent(
            event,
            adapterInput,
            params.options.onResumeSessionId,
          )) {
            if (
              agUiEvent.type === EventType.RUN_ERROR &&
              streamedRunError === null
            ) {
              streamedRunError = getRunErrorMessage(agUiEvent);
            }

            enqueueEvent(
              agUiEvent,
              agUiEvent.type === EventType.RUN_ERROR
                ? handleStreamedRunError
                : undefined,
            );
          }
        },
        error(error) {
          if (ending || closed) {
            return;
          }

          if (params.signal.aborted) {
            abort();
            return;
          }

          if (streamedRunError !== null) {
            closeController(handleStreamedRunError);
            return;
          }

          logger.error("Error in agent execution", {
            error,
            runId: params.input.runId,
            threadId: params.input.threadId,
          });
          const message =
            error instanceof Error ? error.message : "Unknown assistant error";

          const runErrorEvent = {
            type: EventType.RUN_ERROR,
            threadId: params.input.threadId,
            runId: params.input.runId,
            message,
          } satisfies AgUiEvent;

          enqueueEvent(runErrorEvent, () => params.options.onError?.(error));
          closeController();
        },
        complete() {
          if (ending || closed) {
            return;
          }

          if (params.signal.aborted) {
            abort();
            return;
          }

          closeController(
            streamedRunError === null
              ? params.options.onComplete
              : handleStreamedRunError,
          );
        },
      });
    },
    cancel() {
      if (ending || closed) {
        return;
      }

      ending = true;
      closed = true;
      removeAbortHandler();
      subscription?.unsubscribe();
      adapter.interrupt().catch(() => undefined);
      void Promise.resolve(params.options.onAbort?.())
        .catch((error) => {
          logger.error("Error while marking agent stream as aborted", {
            error,
            runId: params.input.runId,
            threadId: params.input.threadId,
          });
        })
        .finally(finish);
    },
  });
}

function normalizeAdapterEvent(
  event: AgUiEvent,
  input: AgUiRunAgentInput,
  onResumeSessionId: (sessionId: string) => unknown,
): AgUiEvent[] {
  if (event.type === EventType.MESSAGES_SNAPSHOT) {
    return [];
  }

  if (event.type === EventType.RUN_STARTED) {
    return [
      {
        ...event,
        parentRunId: input.parentRunId,
        input,
      },
    ];
  }

  if (isSystemInitEvent(event)) {
    let sessionId: string | undefined;

    if (event.value && typeof event.value === "object") {
      if (
        "session_id" in event.value &&
        typeof event.value.session_id === "string"
      ) {
        sessionId = event.value.session_id;
      } else if (
        "sessionId" in event.value &&
        typeof event.value.sessionId === "string"
      ) {
        sessionId = event.value.sessionId;
      }
    }

    if (!sessionId) {
      return [];
    }

    return [
      {
        type: EventType.STATE_DELTA,
        delta: [
          {
            op: "replace",
            path: "",
            value: onResumeSessionId(sessionId),
          },
        ],
      },
    ];
  }

  return [event];
}

function isSystemInitEvent(event: AgUiEvent): event is AgUiCustomEvent {
  return event.type === EventType.CUSTOM && event.name === "system:init";
}

function getRunErrorMessage(event: AgUiEvent) {
  return typeof event.message === "string" && event.message.trim()
    ? event.message
    : "Unknown assistant error";
}
