import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useRef,
} from "react";

import { v4 as uuidv4 } from "uuid";

import { createEmptyMessage } from "@/src/components/ChatMessages/utils/createEmptyMessage";
import { useModelParams } from "@/src/features/playground/page/hooks/useModelParams";
import usePlaygroundCache from "@/src/features/playground/page/hooks/usePlaygroundCache";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import {
  ChatMessageRole,
  extractVariables,
  type ChatMessageWithId,
  type ChatMessageWithIdNoPlaceholders,
  type PromptVariable,
  ToolCallResponseSchema,
  type UIModelParams,
  type ToolCallResponse,
  type LLMToolCall,
  ChatMessageType,
  type ChatMessage,
  compileChatMessagesWithIds,
  type MessagePlaceholderValues,
} from "@langfuse/shared";

import type { MessagesContext } from "@/src/components/ChatMessages/types";
import type { ModelParamsContext } from "@/src/components/ModelParameters";
import { env } from "@/src/env.mjs";
import {
  type PlaygroundSchema,
  type PlaygroundTool,
  type PlaceholderMessageFillIn,
  type PlaygroundProviderProps,
  type PlaygroundHandle,
  PLAYGROUND_EVENTS,
  MULTI_WINDOW_CONFIG,
} from "@/src/features/playground/page/types";
import {
  getPlaygroundEventBus,
  useWindowCoordination,
} from "@/src/features/playground/page/hooks/useWindowCoordination";
import { getFinalModelParams } from "@/src/utils/getFinalModelParams";

type PlaygroundContextType = {
  promptVariables: PromptVariable[];
  updatePromptVariableValue: (variable: string, value: string) => void;
  deletePromptVariable: (variable: string) => void;

  messagePlaceholders: PlaceholderMessageFillIn[];
  updateMessagePlaceholderValue: (name: string, value: ChatMessage[]) => void;
  deleteMessagePlaceholder: (name: string) => void;

  tools: PlaygroundTool[];
  setTools: React.Dispatch<React.SetStateAction<PlaygroundTool[]>>;

  structuredOutputSchema: PlaygroundSchema | null;
  setStructuredOutputSchema: (schema: PlaygroundSchema | null) => void;

  output: string;
  outputReasoning: string;
  outputJson: string;
  outputToolCalls: LLMToolCall[];

  handleSubmit: (streaming?: boolean) => Promise<void>;
  isStreaming: boolean;
} & ModelParamsContext &
  MessagesContext;

const PlaygroundContext = createContext<PlaygroundContextType | undefined>(
  undefined,
);

export const usePlaygroundContext = () => {
  const context = useContext(PlaygroundContext);
  if (!context) {
    throw new Error(
      "usePlaygroundContext must be used within a PlaygroundProvider",
    );
  }
  return context;
};

export const PlaygroundProvider: React.FC<PlaygroundProviderProps> = ({
  children,
  windowId,
}) => {
  const capture = usePostHogClientCapture();
  const projectId = useProjectIdFromURL();
  const { playgroundCache, setPlaygroundCache } = usePlaygroundCache(windowId);
  const [promptVariables, setPromptVariables] = useState<PromptVariable[]>([]);
  const [messagePlaceholders, setMessagePlaceholders] = useState<
    PlaceholderMessageFillIn[]
  >([]);
  const [output, setOutput] = useState("");
  const [outputReasoning, setOutputReasoning] = useState("");
  const [outputToolCalls, setOutputToolCalls] = useState<LLMToolCall[]>([]);
  const [outputJson, setOutputJson] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const isStreamingRef = useRef(isStreaming);
  const [tools, setTools] = useState<PlaygroundTool[]>([]);
  const [structuredOutputSchema, setStructuredOutputSchema] =
    useState<PlaygroundSchema | null>(null);
  const [messages, setMessages] = useState<ChatMessageWithId[]>([
    createEmptyMessage({
      type: ChatMessageType.System,
      role: ChatMessageRole.System,
      content: "",
    }),
    createEmptyMessage({
      type: ChatMessageType.User,
      role: ChatMessageRole.User,
      content: "",
    }),
  ]);

  const {
    modelParams,
    setModelParams,
    availableProviders,
    availableModels,
    updateModelParamValue,
    setModelParamEnabled,
    providerModelCombinations,
  } = useModelParams(windowId);
  const { registerWindow, unregisterWindow } = useWindowCoordination();

  const toolCallIds = messages.reduce((acc, m) => {
    if (m.type === ChatMessageType.AssistantToolCall) {
      acc.push(...m.toolCalls.map((tc) => tc.id));
    }
    return acc;
  }, [] as string[]);

  // Load state from cache
  const [cacheLoaded, setCacheLoaded] = useState(false);
  useEffect(() => {
    if (!playgroundCache) {
      setCacheLoaded(true);
      return;
    }

    const {
      messages: cachedMessages,
      modelParams: cachedModelParams,
      output: cachedOutput,
      promptVariables: cachedPromptVariables,
      messagePlaceholders: cachedMessagePlaceholders,
      tools: cachedTools,
      structuredOutputSchema: cachedStructuredOutputSchema,
    } = playgroundCache;

    setMessages(
      cachedMessages.map((m) => ({
        ...m,
        id: "id" in m && typeof m.id === "string" ? m.id : uuidv4(),
      })),
    );

    if (cachedOutput) {
      // Try parsing a previous output with tool calls
      try {
        const completion = JSON.parse(cachedOutput);
        const parsed = ToolCallResponseSchema.parse(completion);

        setOutput(String(parsed.content));
        setOutputToolCalls(parsed.tool_calls);
      } catch {
        setOutput(cachedOutput);
        setOutputJson("");
      }
    }

    if (cachedModelParams) {
      setModelParams((prev) => ({ ...prev, ...cachedModelParams }));
    }

    if (cachedPromptVariables) {
      setPromptVariables(cachedPromptVariables);
    }

    if (cachedMessagePlaceholders) {
      setMessagePlaceholders(cachedMessagePlaceholders);
    }

    if (cachedTools) {
      setTools(cachedTools);
    }

    if (cachedStructuredOutputSchema) {
      setStructuredOutputSchema(cachedStructuredOutputSchema);
    }

    setCacheLoaded(true);
  }, [playgroundCache, setModelParams]);

  const updatePromptVariables = useCallback(() => {
    const messageContents = messages
      .map((m) => ("content" in m ? m.content : m.name))
      .join("\n");
    const variables = extractVariables(messageContents)
      .map((v) => v.trim())
      .filter(Boolean);

    setPromptVariables((prev) => {
      // Update isUsed flag
      const next = prev.reduce<PromptVariable[]>((acc, v) => {
        const isUsed = variables.includes(v.name);

        if (!isUsed && !v.value) return acc;

        acc.push({ ...v, isUsed: isUsed });

        return acc;
      }, []);

      // Create new variables if any
      for (const variable of variables) {
        if (!next.some((v) => v.name === variable)) {
          next.push({ name: variable, value: "", isUsed: true });
        }
      }

      return next;
    });
  }, [messages]);

  useEffect(updatePromptVariables, [messages, updatePromptVariables]);

  const addMessage: PlaygroundContextType["addMessage"] = useCallback(
    (message) => {
      if (message.type === ChatMessageType.AssistantToolCall) {
        const toolCallMessage = createEmptyMessage({
          type: ChatMessageType.AssistantToolCall,
          role: ChatMessageRole.Assistant,
          content: message.content ?? "",
          toolCalls: message.toolCalls,
        });
        const toolResultMessages: ChatMessageWithId[] = [];

        for (const toolCall of message.toolCalls) {
          const toolResultMessage = createEmptyMessage({
            type: ChatMessageType.ToolResult,
            role: ChatMessageRole.Tool,
            content: "",
            toolCallId: toolCall.id,
          });

          toolResultMessages.push(toolResultMessage);
        }

        setMessages((prev) => [
          ...prev,
          ...[toolCallMessage],
          ...toolResultMessages,
        ]);

        return toolCallMessage;
      } else if (message.type === ChatMessageType.Placeholder) {
        const placeholderMessage = {
          ...message,
          id: uuidv4(),
        } as ChatMessageWithId;
        setMessages((prev) => [...prev, placeholderMessage]);
        return placeholderMessage;
      } else {
        const newMessage = createEmptyMessage(message);
        setMessages((prev) => [...prev, newMessage]);

        return newMessage;
      }
    },
    [],
  );

  const updateMessage: PlaygroundContextType["updateMessage"] = useCallback(
    (_, id, key, value) => {
      setMessages((prev) =>
        prev.map((message) =>
          message.id === id ? { ...message, [key]: value } : message,
        ),
      );
    },
    [],
  );

  const replaceMessage: PlaygroundContextType["replaceMessage"] = useCallback(
    (id, message) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { id, ...message } : m)),
      );
    },
    [],
  );

  const deleteMessage: PlaygroundContextType["deleteMessage"] = useCallback(
    (id) => {
      setMessages((prev) => prev.filter((message) => message.id !== id));
    },
    [],
  );

  const handleSubmit: PlaygroundContextType["handleSubmit"] = useCallback(
    async (streaming = true) => {
      try {
        setIsStreaming(true);
        setOutput("");
        setOutputReasoning("");
        setOutputJson("");
        setOutputToolCalls([]);

        const finalMessages = getFinalMessages(
          promptVariables,
          messages,
          messagePlaceholders,
        );

        if (finalMessages.length === 0) {
          throw new Error("Please add at least one message with content.");
        }

        const leftOverVariables = extractVariables(
          finalMessages
            .map((m) => (typeof m.content === "string" ? m.content : ""))
            .join("\n"),
        );

        if (!modelParams.provider.value || !modelParams.model.value) {
          throw new Error("Please select a model");
        }

        if (leftOverVariables.length > 0) {
          throw Error("Error replacing variables. Please check your inputs.");
        }

        if (tools.length > 0 && structuredOutputSchema) {
          throw new Error(
            "Cannot use both tools and structured output at the same time",
          );
        }

        let response = "";
        if (tools.length > 0) {
          const completion = await getChatCompletionWithTools(
            projectId,
            finalMessages,
            modelParams,
            tools,
            streaming,
          );

          const displayContent =
            typeof completion.content === "string"
              ? completion.content
              : (completion.content.find(
                  (m): m is { type: "text"; text: string } =>
                    "type" in m && m.type === "text",
                )?.text as string);

          setOutput(displayContent);
          setOutputToolCalls(completion.tool_calls);
          if (completion.reasoning) setOutputReasoning(completion.reasoning);

          response = JSON.stringify(completion, null, 2);
        } else if (structuredOutputSchema) {
          response = await getChatCompletionWithStructuredOutput(
            projectId,
            finalMessages,
            modelParams,
            structuredOutputSchema,
            streaming,
          );

          setOutput(response);
        } else {
          if (streaming) {
            const completionStream = getChatCompletionStream(
              projectId,
              finalMessages,
              modelParams,
            );

            for await (const token of completionStream) {
              response += token;
              setOutput(response);
            }
          } else {
            const result = await getChatCompletionNonStreaming(
              projectId,
              finalMessages,
              modelParams,
            );
            response = result.content;
            setOutput(result.content);
            if (result.reasoning) setOutputReasoning(result.reasoning);
          }
        }

        setOutputJson(
          getOutputJson(
            response,
            finalMessages,
            modelParams,
            tools,
            structuredOutputSchema,
          ),
        );
        setPlaygroundCache({
          messages,
          modelParams,
          output: response,
          promptVariables,
          messagePlaceholders,
          tools,
          structuredOutputSchema,
        });
        capture("playground:execute_button_click", {
          inputLength: finalMessages.length,
          modelName: modelParams.model,
          modelProvider: modelParams.provider,
          outputLength: response.length,
          toolCount: tools.length,
          isStructuredOutput: Boolean(structuredOutputSchema),
        });
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "An error occurred";
        showErrorToast("Error", errorMessage);
      } finally {
        setIsStreaming(false);
      }
    },
    [
      messages,
      modelParams,
      promptVariables,
      messagePlaceholders,
      tools,
      capture,
      setPlaygroundCache,
      structuredOutputSchema,
      projectId,
    ],
  );

  // Command enter handling moved to Messages component to access streaming preference

  const updatePromptVariableValue = useCallback(
    (variable: string, value: string) => {
      setPromptVariables((prev) =>
        prev.map((v) => (v.name === variable ? { ...v, value } : v)),
      );
    },
    [],
  );

  const deletePromptVariable = useCallback((variable: string) => {
    setPromptVariables((prev) => prev.filter((v) => v.name !== variable));
  }, []);

  const updateMessagePlaceholderValue = useCallback(
    (name: string, value: ChatMessage[]) => {
      setMessagePlaceholders((prev) =>
        prev.map((p) => (p.name === name ? { ...p, value } : p)),
      );
    },
    [],
  );

  const deleteMessagePlaceholder = useCallback((name: string) => {
    setMessagePlaceholders((prev) => prev.filter((p) => p.name !== name));
  }, []);

  const updateMessagePlaceholders = useCallback(() => {
    const placeholderNames = messages
      .filter(
        (
          msg,
        ): msg is ChatMessageWithId & {
          type: ChatMessageType.Placeholder;
          name: string;
        } => msg.type === ChatMessageType.Placeholder,
      )
      .map((msg) => msg.name);

    setMessagePlaceholders((prev) => {
      // Set isUsed flag for existing placeholders and remove unused ones
      const next = prev.reduce<PlaceholderMessageFillIn[]>(
        (updatedPlaceholders, p) => {
          const isUsed = placeholderNames.includes(p.name);
          // Remove unused placeholders
          if (!isUsed && p.value.length === 0) {
            return updatedPlaceholders;
          }
          updatedPlaceholders.push({ ...p, isUsed });
          return updatedPlaceholders;
        },
        [],
      );

      // Add new placeholders
      for (const name of placeholderNames) {
        if (!next.some((p) => p.name === name)) {
          next.push({ name, value: [], isUsed: true });
        }
      }

      return next;
    });
  }, [messages]);

  useEffect(updateMessagePlaceholders, [messages, updateMessagePlaceholders]);

  // Save state to cache whenever it changes
  // This ensures that user changes are persisted across refreshes and navigation
  useEffect(() => {
    // Only save after cache has been loaded to avoid overwriting with initial state
    if (!cacheLoaded) return;

    // Don't save empty initial state to avoid overwriting valid cache
    // Save if we have messages - provider selection is optional
    if (messages.length > 0) {
      setPlaygroundCache({
        messages,
        modelParams,
        output,
        promptVariables,
        messagePlaceholders,
        tools,
        structuredOutputSchema,
      });
    }
  }, [
    messages,
    modelParams,
    output,
    promptVariables,
    messagePlaceholders,
    tools,
    structuredOutputSchema,
    setPlaygroundCache,
    cacheLoaded,
  ]);

  // Window self-registration for global coordination
  // This effect registers the window with the global coordination system
  // and sets up event listeners for global actions like "Run All" and "Stop All"
  useEffect(() => {
    const effectiveWindowId = windowId || MULTI_WINDOW_CONFIG.DEFAULT_WINDOW_ID;
    const playgroundEventBus = getPlaygroundEventBus();

    const playgroundHandle: PlaygroundHandle = {
      handleSubmit,
      stopExecution: () => {
        setIsStreaming(false);
        isStreamingRef.current = false;
      },
      getIsStreaming: () => isStreamingRef.current,
      hasModelConfigured: () => {
        return Boolean(modelParams.provider.value && modelParams.model.value);
      },
    };

    registerWindow(effectiveWindowId, playgroundHandle);

    const handleGlobalExecute = () => {
      if (!isStreamingRef.current) {
        // Check if this window has any content at all (including placeholders)
        const hasAnyContent = messages.some((message) => {
          if (message.type === ChatMessageType.Placeholder) {
            return true; // Placeholders are considered content
          }
          if (typeof message.content === "string") {
            return message.content.trim().length > 0;
          }
          return true; // Non-string content (tool calls, etc.) is considered valid
        });

        if (hasAnyContent) {
          // Window has content - let it execute and show any validation errors
          handleSubmit(true).catch((err) => console.error(err));
        }
        // If no content, skip silently
      }
    };

    const handleGlobalStop = () => {
      if (isStreamingRef.current) {
        setIsStreaming(false);
        isStreamingRef.current = false;
      }
    };

    playgroundEventBus.addEventListener(
      PLAYGROUND_EVENTS.EXECUTE_ALL,
      handleGlobalExecute,
    );
    playgroundEventBus.addEventListener(
      PLAYGROUND_EVENTS.STOP_ALL,
      handleGlobalStop,
    );

    return () => {
      unregisterWindow(effectiveWindowId);

      playgroundEventBus.removeEventListener(
        PLAYGROUND_EVENTS.EXECUTE_ALL,
        handleGlobalExecute,
      );
      playgroundEventBus.removeEventListener(
        PLAYGROUND_EVENTS.STOP_ALL,
        handleGlobalStop,
      );
    };
  }, [
    windowId,
    handleSubmit,
    registerWindow,
    unregisterWindow,
    messages,
    modelParams.provider.value,
    modelParams.model.value,
  ]);

  // Keep ref in sync with state for external consumers
  useEffect(() => {
    isStreamingRef.current = isStreaming;

    // Dispatch execution state change event so global coordinator can update counts
    const playgroundEventBus = getPlaygroundEventBus();
    playgroundEventBus.dispatchEvent(
      new CustomEvent(PLAYGROUND_EVENTS.WINDOW_EXECUTION_STATE_CHANGE, {
        detail: {
          windowId: windowId || MULTI_WINDOW_CONFIG.DEFAULT_WINDOW_ID,
          isStreaming,
        },
      }),
    );
  }, [windowId, isStreaming]);

  // Notify when model configuration changes
  useEffect(() => {
    const playgroundEventBus = getPlaygroundEventBus();
    playgroundEventBus.dispatchEvent(
      new CustomEvent(PLAYGROUND_EVENTS.WINDOW_MODEL_CONFIG_CHANGE, {
        detail: {
          windowId: windowId || MULTI_WINDOW_CONFIG.DEFAULT_WINDOW_ID,
          hasModel: Boolean(
            modelParams.provider.value && modelParams.model.value,
          ),
        },
      }),
    );
  }, [windowId, modelParams.provider.value, modelParams.model.value]);

  return (
    <PlaygroundContext.Provider
      value={{
        promptVariables,
        updatePromptVariableValue,
        deletePromptVariable,
        messagePlaceholders,
        updateMessagePlaceholderValue,
        deleteMessagePlaceholder,

        tools,
        setTools,

        structuredOutputSchema,
        setStructuredOutputSchema,

        messages,
        addMessage,
        setMessages,
        updateMessage,
        replaceMessage,
        deleteMessage,
        toolCallIds,

        modelParams,
        updateModelParamValue,
        setModelParamEnabled,
        providerModelCombinations,

        output,
        outputReasoning,
        outputJson,
        outputToolCalls,
        handleSubmit,
        isStreaming,

        availableProviders,
        availableModels,
      }}
    >
      {children}
    </PlaygroundContext.Provider>
  );
};

async function getChatCompletionWithTools(
  projectId: string | undefined,
  messages: ChatMessageWithIdNoPlaceholders[],
  modelParams: UIModelParams,
  tools: unknown[],
  streaming: boolean = false,
): Promise<ToolCallResponse & { reasoning?: string }> {
  if (!projectId) throw Error("Project ID is not set");

  const body = JSON.stringify({
    projectId,
    messages,
    modelParams: getFinalModelParams(modelParams),
    tools,
    streaming,
  });

  const result = await fetch(
    `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/chatCompletion`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    },
  );

  const responseData = await result.json();

  if (!result.ok) {
    throw new Error(`Completion failed: ${responseData.message}`);
  }

  const parsed = ToolCallResponseSchema.safeParse(responseData);
  if (!parsed.success)
    throw Error(
      "Failed to parse tool call response client-side:\n" +
        JSON.stringify(responseData, null, 2),
    );

  return {
    ...parsed.data,
    ...(responseData.reasoning ? { reasoning: responseData.reasoning } : {}),
  };
}

async function getChatCompletionWithStructuredOutput(
  projectId: string | undefined,
  messages: ChatMessageWithId[],
  modelParams: UIModelParams,
  structuredOutputSchema: PlaygroundSchema | null,
  streaming: boolean = false,
): Promise<string> {
  if (!projectId) throw Error("Project ID is not set");

  const body = JSON.stringify({
    projectId,
    messages,
    modelParams: getFinalModelParams(modelParams),
    structuredOutputSchema: structuredOutputSchema?.schema,
    streaming,
  });

  const result = await fetch(
    `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/chatCompletion`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    },
  );

  if (!result.ok) {
    const responseData = await result.json();
    throw new Error(`Completion failed: ${responseData.message}`);
  }

  const responseData = await result.text();

  try {
    const parsed = JSON.parse(responseData);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return responseData;
  }
}

async function* getChatCompletionStream(
  projectId: string | undefined,
  messages: ChatMessageWithId[],
  modelParams: UIModelParams,
) {
  if (!projectId) {
    console.error("Project ID is not set");
    return;
  }

  const hasToolResults = messages.some(
    (msg) => msg.type === ChatMessageType.ToolResult,
  );

  const body = JSON.stringify({
    projectId,
    messages,
    modelParams: getFinalModelParams(modelParams),
    streaming: true,
    // Include empty tools array if there are tool result messages to ensure processing
    // E.g. if tool call was picked up through traces but not defined
    ...(hasToolResults && { tools: [] }),
  });

  const result = await fetch(
    `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/chatCompletion`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    },
  );

  if (!result.ok) {
    const errorData = await result.json();

    throw new Error(`Completion failed: ${errorData.message}`);
  }

  const reader = result.body?.getReader();
  if (!reader) {
    throw new Error("Failed to read response body");
  }

  const decoder = new TextDecoder("utf-8");
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const token = decoder.decode(value);

      yield token;
    }
  } catch (error) {
    throw error;
  } finally {
    reader.releaseLock();
  }
}

async function getChatCompletionNonStreaming(
  projectId: string | undefined,
  messages: ChatMessageWithId[],
  modelParams: UIModelParams,
): Promise<{ content: string; reasoning?: string }> {
  if (!projectId) {
    throw new Error("Project ID is not set");
  }

  const hasToolResults = messages.some(
    (msg) => msg.type === ChatMessageType.ToolResult,
  );

  const body = JSON.stringify({
    projectId,
    messages,
    modelParams: getFinalModelParams(modelParams),
    streaming: false,
    // Include empty tools array if there are tool result messages to ensure processing
    // E.g. if tool call was picked up through traces but not defined
    ...(hasToolResults && { tools: [] }),
  });

  const result = await fetch(
    `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/chatCompletion`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    },
  );

  if (!result.ok) {
    const errorData = await result.json();
    throw new Error(`Completion failed: ${errorData.message}`);
  }

  const responseData = await result.json();
  return {
    content: responseData.content || "",
    reasoning: responseData.reasoning,
  };
}

function getFinalMessages(
  promptVariables: PromptVariable[],
  messages: ChatMessageWithId[],
  messagePlaceholders: PlaceholderMessageFillIn[],
): ChatMessageWithIdNoPlaceholders[] {
  const missingVariables = promptVariables.filter((v) => !v.value && v.isUsed);
  if (missingVariables.length > 0) {
    throw new Error(
      `Please set a value for the following variables: ${missingVariables
        .map((v) => v.name)
        .join(", ")}`,
    );
  }

  const missingPlaceholders = messagePlaceholders.filter(
    (p) => p.value.length === 0 && p.isUsed,
  );
  if (missingPlaceholders.length > 0) {
    throw new Error(
      `Please set values for the following message placeholders: ${missingPlaceholders
        .map((p) => p.name)
        .join(", ")}`,
    );
  }

  const placeholderValues: MessagePlaceholderValues =
    messagePlaceholders.reduce((placeholderMap, p) => {
      placeholderMap[p.name] = p.value;
      return placeholderMap;
    }, {} as MessagePlaceholderValues);

  const textVariables = promptVariables.reduce(
    (variableMap, v) => {
      variableMap[v.name] = v.value;
      return variableMap;
    },
    {} as Record<string, string>,
  );

  const compiledMessages = compileChatMessagesWithIds(
    messages,
    placeholderValues,
    textVariables,
  );

  // Filter empty messages (except tool calls), e.g. if placeholder value was empty
  return compiledMessages.filter((m) => {
    // Standard ChatMessage filtering
    if (typeof m.content === "string") {
      return (
        m.content.length > 0 ||
        ("toolCalls" in m &&
          m.toolCalls &&
          Array.isArray(m.toolCalls) &&
          m.toolCalls.length > 0)
      );
    }

    // For arbitrary objects, keep them (assume they have meaningful content)
    return true;
  });
}

function getOutputJson(
  output: string,
  messages: ChatMessageWithId[],
  modelParams: UIModelParams,
  tools: PlaygroundTool[],
  structuredOutputSchema: PlaygroundSchema | null,
) {
  return JSON.stringify(
    {
      input: messages.map((obj) => filterKeyFromObject(obj, "id")),
      output,
      model: getFinalModelParams(modelParams),
      tools,
      structuredOutputSchema,
    },
    null,
    2,
  );
}

function filterKeyFromObject<T extends object>(obj: T, key: keyof T) {
  return Object.fromEntries(Object.entries(obj).filter(([k, _]) => k !== key));
}
