import { EventType } from "@ag-ui/core";
import { ClaudeAgentAdapter } from "@ag-ui/claude-agent-sdk";
import { z } from "zod";

import type {
  AgUiCustomEvent,
  AgUiEvent,
  AgUiRunAgentInput,
} from "@/src/features/in-app-agent/schema";

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
  onComplete?: () => void;
  onAbort?: () => void;
  onError?: (error: unknown) => void;
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
  let closed = false;
  let finished = false;
  let abortHandler: (() => void) | undefined;

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
      void Promise.resolve(params.options.onFinish?.()).catch((error) => {
        console.error("Error in agent stream cleanup:", error);
      });
    } catch (error) {
      console.error("Error in agent stream cleanup:", error);
    }
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      let streamedRunError: string | null = null;

      const closeController = () => {
        if (closed) {
          return;
        }

        closed = true;
        removeAbortHandler();
        controller.close();
        finish();
      };

      const abort = () => {
        if (closed) {
          return;
        }

        params.options.onAbort?.();
        adapter.interrupt().catch(() => undefined);
        closeController();
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
          if (closed) {
            return;
          }

          if (params.signal.aborted) {
            abort();
            return;
          }

          for (const agUiEvent of normalizeAdapterEvent(
            event,
            params.options.onResumeSessionId,
          )) {
            if (
              agUiEvent.type === EventType.RUN_ERROR &&
              streamedRunError === null
            ) {
              streamedRunError = getRunErrorMessage(agUiEvent);
              params.options.onError?.(new Error(streamedRunError));
            }

            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(agUiEvent)}\n\n`),
            );
          }
        },
        error(error) {
          if (closed) {
            return;
          }

          if (params.signal.aborted) {
            abort();
            return;
          }

          if (streamedRunError !== null) {
            closeController();
            return;
          }

          console.error("Error in agent execution:", error);
          params.options.onError?.(error);

          const message =
            error instanceof Error ? error.message : "Unknown assistant error";

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: EventType.RUN_ERROR,
                message,
              } satisfies AgUiEvent)}\n\n`,
            ),
          );
          closeController();
        },
        complete() {
          if (closed) {
            return;
          }

          if (params.signal.aborted) {
            abort();
            return;
          }

          if (streamedRunError === null) {
            params.options.onComplete?.();
          }
          closeController();
        },
      });
    },
    cancel() {
      if (closed) {
        return;
      }

      closed = true;
      params.options.onAbort?.();
      removeAbortHandler();
      subscription?.unsubscribe();
      adapter.interrupt().catch(() => undefined);
      finish();
    },
  });
}

function normalizeAdapterEvent(
  event: AgUiEvent,
  onResumeSessionId: (sessionId: string) => unknown,
): AgUiEvent[] {
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
