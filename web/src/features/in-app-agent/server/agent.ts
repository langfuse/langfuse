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
  createResumeStateForSessionId: (sessionId: string) => unknown;
  awsCredentials: {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
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
      AWS_DEFAULT_REGION: params.options.awsCredentials.region,
      AWS_REGION: params.options.awsCredentials.region,
      AWS_ACCESS_KEY_ID: params.options.awsCredentials.accessKeyId,
      AWS_SECRET_ACCESS_KEY: params.options.awsCredentials.secretAccessKey,
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

  return new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const closeController = () => {
        if (closed) {
          return;
        }

        closed = true;
        controller.close();
      };

      const abort = () => {
        void adapter.interrupt().catch(() => undefined);
        closeController();
      };

      let subscription: { unsubscribe: () => void } | undefined;

      const handleAbort = () => {
        subscription?.unsubscribe();
        abort();
      };

      if (params.signal.aborted) {
        abort();
        return;
      }

      params.signal.addEventListener("abort", handleAbort, { once: true });

      subscription = adapter.run(adapterInput).subscribe({
        next(event) {
          if (closed || params.signal.aborted) {
            abort();
            return;
          }

          for (const agUiEvent of normalizeAdapterEvent(
            event,
            params.options.createResumeStateForSessionId,
          )) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(agUiEvent)}\n\n`),
            );
          }
        },
        error(error) {
          if (closed || params.signal.aborted) {
            closeController();
            return;
          }

          console.error("Error in agent execution:", error);

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
          closeController();
        },
      });
    },
  });
}

function normalizeAdapterEvent(
  event: AgUiEvent,
  createResumeStateForSessionId: (sessionId: string) => unknown,
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

    return sessionId
      ? [
          {
            type: EventType.STATE_DELTA,
            delta: [
              {
                op: "replace",
                path: "",
                value: createResumeStateForSessionId(sessionId),
              },
            ],
          },
        ]
      : [];
  }

  return [event];
}

function isSystemInitEvent(event: AgUiEvent): event is AgUiCustomEvent {
  return event.type === EventType.CUSTOM && event.name === "system:init";
}
