import { readFile } from "node:fs/promises";
import path from "node:path";

import { EventType } from "@ag-ui/core";
import { MastraAgent } from "@ag-ui/mastra";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { Agent } from "@mastra/core/agent";
import { MCPClient } from "@mastra/mcp";
import type { Langfuse } from "langfuse";

import type {
  AgUiEvent,
  AgUiRunAgentInput,
} from "@/src/features/in-app-agent/schema";
import type { InAppAgentTracingConfig } from "@/src/features/in-app-agent/server/instrumentation";
import { createInAppAgentInstrumentation } from "@/src/features/in-app-agent/server/instrumentation";
import { logger } from "@langfuse/shared/src/server";

const ASSISTANT_TITLE = "Langfuse Assistant";
const IN_APP_AGENT_SYSTEM_PROMPT_NAME = "in-app-agent-system-prompt";
const LOCAL_IN_APP_AGENT_SYSTEM_PROMPT_DIR = path.join(
  process.cwd(),
  "src/features/in-app-agent/prompts/",
);
const MAX_AGENT_STEPS = 10;
const LANGFUSE_DOCS_MCP_URL = "https://langfuse.com/api/mcp";

type CreateAgUiStreamOptions = {
  onEvent?: (event: AgUiEvent) => void | Promise<void>;
  onComplete?: () => void | Promise<void>;
  onAbort?: () => void | Promise<void>;
  onError?: (error: unknown) => void | Promise<void>;
  onFinish?: () => void | Promise<void>;
  awsBedrock: {
    region?: string;
    profile?: string;
    modelId: string;
  };
  langfuseMcp: {
    url: string;
    publicKey: string;
    secretKey: string;
  };
  langfuseClient: Langfuse;
  langfuseTracing?: InAppAgentTracingConfig;
};

export function createAgUiStream(params: {
  input: AgUiRunAgentInput;
  signal: AbortSignal;
  options: CreateAgUiStreamOptions;
}) {
  const encoder = new TextEncoder();
  const awsProfile =
    process.env.AWS_PROFILE ?? params.options.awsBedrock.profile;

  const langfuseMcpAuthHeader = `Basic ${Buffer.from(
    `${params.options.langfuseMcp.publicKey}:${params.options.langfuseMcp.secretKey}`,
  ).toString("base64")}`;
  const instrumentation = createInAppAgentInstrumentation({
    input: params.input,
    tracing: params.options.langfuseTracing,
  });

  let subscription: { unsubscribe: () => void } | undefined;
  let ending = false;
  let closed = false;
  let finished = false;
  let shouldEnqueue = true;
  let abortHandler: (() => void) | undefined;
  let eventQueue = Promise.resolve();
  let cleanupAdapter: (() => Promise<void>) | undefined;
  let interruptAdapter: (() => void) | undefined;

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
    eventQueue
      .then(async () => {
        const results = await Promise.allSettled([
          cleanupAdapter?.(),
          params.options.onFinish?.(),
        ]);

        for (const result of results) {
          if (result.status === "rejected") {
            logger.error("Error in agent stream cleanup", {
              error: result.reason,
              runId: params.input.runId,
              threadId: params.input.threadId,
            });
          }
        }
      })
      .catch((error) => {
        logger.error("Error in agent stream cleanup", {
          error,
          runId: params.input.runId,
          threadId: params.input.threadId,
        });
      });
  };

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

  return new ReadableStream<Uint8Array>({
    start(controller) {
      let streamedRunError: string | null = null;
      let streamedRunErrorHandled = false;

      const failStream = (error: unknown, eventType?: string) => {
        if (closed) {
          return;
        }

        instrumentation?.endWithError(error);
        instrumentation?.flush();
        ending = true;
        closed = true;
        shouldEnqueue = false;
        removeAbortHandler();
        interruptAdapter?.();
        subscription?.unsubscribe();

        logger.error("Failed to persist in-app agent event", {
          error,
          runId: params.input.runId,
          threadId: params.input.threadId,
          eventType,
        });

        runTerminalCallback(
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

            if (closed || !shouldEnqueue) {
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
        subscription?.unsubscribe();
        eventQueue
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

      const abortStream = () => {
        if (ending || closed) {
          return;
        }

        instrumentation?.end({ aborted: true });
        instrumentation?.flush();
        ending = true;
        shouldEnqueue = false;
        removeAbortHandler();
        interruptAdapter?.();
        subscription?.unsubscribe();
        eventQueue
          .then(() =>
            runTerminalCallback(
              () => params.options.onAbort?.(),
              "Error while marking agent stream as aborted",
            ),
          )
          .then(() => {
            if (closed) {
              return;
            }

            closed = true;
            controller.close();
          })
          .catch((error) => {
            closed = true;
            logger.error("Error while aborting agent stream", {
              error,
              runId: params.input.runId,
              threadId: params.input.threadId,
            });
          })
          .finally(finish);
      };

      abortHandler = abortStream;

      if (params.signal.aborted) {
        abortStream();
        return;
      }

      params.signal.addEventListener("abort", abortHandler, { once: true });

      createMastraAdapter({
        input: params.input,
        signal: params.signal,
        langfuseMcpAuthHeader,
        options: params.options,
        awsProfile,
        instrumentation,
      })
        .then(({ adapter, cleanup, interrupt }) => {
          if (ending || closed || params.signal.aborted) {
            interrupt();
            cleanup().catch((error) => {
              logger.error("Error in agent stream cleanup", {
                error,
                runId: params.input.runId,
                threadId: params.input.threadId,
              });
            });
            abortStream();
            return;
          }

          cleanupAdapter = cleanup;
          interruptAdapter = interrupt;

          subscription = adapter.run(params.input).subscribe({
            next(event) {
              if (ending || closed) {
                return;
              }

              if (params.signal.aborted) {
                abortStream();
                return;
              }

              const agUiEvents = normalizeAdapterEvent(
                event satisfies AgUiEvent,
                params.input,
              );

              instrumentation?.recordEvents(agUiEvents);

              for (const agUiEvent of agUiEvents) {
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
                abortStream();
                return;
              }

              if (streamedRunError !== null) {
                closeController(() => {
                  instrumentation?.flush();
                  return handleStreamedRunError();
                });
                return;
              }

              logger.error("Error in agent execution", {
                error,
                runId: params.input.runId,
                threadId: params.input.threadId,
              });

              const runErrorEvent = createRunErrorEvent(params.input, error);
              instrumentation?.recordEvents([runErrorEvent]);
              enqueueEvent(runErrorEvent, () =>
                params.options.onError?.(error),
              );
              closeController(() => instrumentation?.flush());
            },
            complete() {
              if (ending || closed) {
                return;
              }

              if (params.signal.aborted) {
                abortStream();
                return;
              }

              closeController(
                streamedRunError === null
                  ? () => {
                      instrumentation?.end({});
                      instrumentation?.flush();
                      return params.options.onComplete?.();
                    }
                  : () => {
                      instrumentation?.flush();
                      return handleStreamedRunError();
                    },
              );
            },
          });
        })
        .catch((error) => {
          if (ending || closed) {
            return;
          }

          if (params.signal.aborted) {
            abortStream();
            return;
          }

          logger.error("Error initializing agent", {
            error,
            runId: params.input.runId,
            threadId: params.input.threadId,
          });

          const runErrorEvent = createRunErrorEvent(params.input, error);
          instrumentation?.recordEvents([runErrorEvent]);
          enqueueEvent(runErrorEvent, () => params.options.onError?.(error));
          closeController(() => instrumentation?.flush());
        });
    },
    cancel() {
      if (ending || closed) {
        return;
      }

      ending = true;
      instrumentation?.end({ aborted: true });
      instrumentation?.flush();
      shouldEnqueue = false;
      removeAbortHandler();
      interruptAdapter?.();
      subscription?.unsubscribe();
      eventQueue
        .then(() =>
          runTerminalCallback(
            () => params.options.onAbort?.(),
            "Error while marking agent stream as aborted",
          ),
        )
        .then(() => {
          closed = true;
        })
        .catch((error) => {
          closed = true;
          logger.error("Error while cancelling agent stream", {
            error,
            runId: params.input.runId,
            threadId: params.input.threadId,
          });
        })
        .finally(finish);
    },
  });
}

async function createMastraAdapter(params: {
  input: AgUiRunAgentInput;
  signal: AbortSignal;
  langfuseMcpAuthHeader: string;
  options: CreateAgUiStreamOptions;
  awsProfile?: string;
  instrumentation?: ReturnType<typeof createInAppAgentInstrumentation>;
}) {
  const bedrock = createAmazonBedrock({
    ...(params.options.awsBedrock.region
      ? { region: params.options.awsBedrock.region }
      : {}),
    credentialProvider: fromNodeProviderChain(
      params.awsProfile ? { profile: params.awsProfile } : {},
    ),
  });

  const mcpClient = new MCPClient({
    id: `in-app-agent-${params.input.runId}`,
    servers: {
      langfuse: {
        url: new URL(params.options.langfuseMcp.url),
        requestInit: {
          headers: {
            Authorization: params.langfuseMcpAuthHeader,
          },
        },
      },
      langfuseDocs: {
        url: new URL(LANGFUSE_DOCS_MCP_URL),
      },
    },
  });

  try {
    const { toolsets, errors } = await mcpClient.listToolsetsWithErrors();

    if (errors.langfuse) {
      throw new Error(`Failed to initialize Langfuse MCP: ${errors.langfuse}`);
    }

    if (errors.langfuseDocs) {
      logger.warn("Failed to initialize Langfuse docs MCP", {
        error: errors.langfuseDocs,
        runId: params.input.runId,
        threadId: params.input.threadId,
      });
    }

    const tools = {
      ...prefixToolsetTools("langfuse", toolsets.langfuse),
      ...prefixToolsetTools("langfuseDocs", toolsets.langfuseDocs),
    };

    const instructions = await getSystemPromptInstructions({
      langfuseClient: params.options.langfuseClient,
      instrumentation: params.instrumentation,
      variables: { currentDate: new Date().toISOString() },
    });

    const agent = new Agent({
      id: "langfuse-in-app-assistant",
      name: ASSISTANT_TITLE,
      instructions,
      model: bedrock(
        params.options.awsBedrock.modelId as Parameters<typeof bedrock>[0],
      ),
      tools,
      defaultOptions: {
        abortSignal: params.signal,
        maxSteps: MAX_AGENT_STEPS,
      },
    });

    return {
      adapter: new MastraAgent({
        agent,
        resourceId: params.input.threadId,
      }),
      interrupt: () => agent.abortRunStream(params.input.runId),
      cleanup: () => mcpClient.disconnect(),
    };
  } catch (error) {
    await mcpClient.disconnect().catch((disconnectError) => {
      logger.error("Error cleaning up failed agent initialization", {
        error: disconnectError,
        runId: params.input.runId,
        threadId: params.input.threadId,
      });
    });
    throw error;
  }
}

function prefixToolsetTools<TTool>(
  serverName: string,
  toolset: Record<string, TTool> | undefined,
) {
  return Object.fromEntries(
    Object.entries(toolset ?? {}).map(([toolName, tool]) => [
      `${serverName}_${toolName}`,
      tool,
    ]),
  );
}

async function getSystemPromptInstructions(params: {
  langfuseClient: Langfuse;
  instrumentation?: ReturnType<typeof createInAppAgentInstrumentation>;
  variables: { currentDate: string };
}) {
  if (process.env.NODE_ENV === "development") {
    const promptTemplate = await readFile(
      path.join(
        LOCAL_IN_APP_AGENT_SYSTEM_PROMPT_DIR,
        `${IN_APP_AGENT_SYSTEM_PROMPT_NAME}.txt`,
      ),
      "utf8",
    );

    return compileLocalPrompt(promptTemplate, params.variables);
  }

  const prompt = await params.langfuseClient.getPrompt(
    IN_APP_AGENT_SYSTEM_PROMPT_NAME,
    undefined,
    { type: "text" },
  );
  params.instrumentation?.setPrompt({
    name: prompt.name,
    version: prompt.version,
  });

  return prompt.compile(params.variables);
}

function compileLocalPrompt(
  promptTemplate: string,
  variables: Record<string, string>,
) {
  return promptTemplate.replace(/{{\s*(\w+)\s*}}/g, (match, variable) => {
    return variables[variable] ?? match;
  });
}

function normalizeAdapterEvent(
  event: AgUiEvent,
  input: AgUiRunAgentInput,
): AgUiEvent[] {
  if (event.type === EventType.RUN_STARTED) {
    const publicEvent = { ...event };
    delete publicEvent.input;

    return [
      {
        ...publicEvent,
        ...(input.parentRunId ? { parentRunId: input.parentRunId } : {}),
      },
    ];
  }

  return [event];
}

function createRunErrorEvent(
  input: AgUiRunAgentInput,
  error: unknown,
): AgUiEvent {
  const message =
    error instanceof Error ? error.message : "Unknown assistant error";

  return {
    type: EventType.RUN_ERROR,
    threadId: input.threadId,
    runId: input.runId,
    message,
  };
}

function getRunErrorMessage(event: AgUiEvent) {
  return typeof event.message === "string" && event.message.trim()
    ? event.message
    : "Unknown assistant error";
}
