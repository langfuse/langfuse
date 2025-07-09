import React, {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { v4 as uuidv4 } from "uuid";

import { createEmptyMessage } from "@/src/components/ChatMessages/utils/createEmptyMessage";
import { useModelParams } from "@/src/features/playground/page/hooks/useModelParams";
import usePlaygroundCache from "@/src/features/playground/page/hooks/usePlaygroundCache";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
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
} from "@/src/features/playground/page/types";
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

export const PlaygroundProvider: React.FC<PropsWithChildren> = ({
  children,
}) => {
  const capture = usePostHogClientCapture();
  const projectId = useProjectIdFromURL();
  const { playgroundCache, setPlaygroundCache } = usePlaygroundCache();
  const [promptVariables, setPromptVariables] = useState<PromptVariable[]>([]);
  const [messagePlaceholders, setMessagePlaceholders] = useState<
    PlaceholderMessageFillIn[]
  >([]);
  const [output, setOutput] = useState("");
  const [outputToolCalls, setOutputToolCalls] = useState<LLMToolCall[]>([]);
  const [outputJson, setOutputJson] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
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
  } = useModelParams();

  const toolCallIds = messages.reduce((acc, m) => {
    if (m.type === ChatMessageType.AssistantToolCall) {
      acc.push(...m.toolCalls.map((tc) => tc.id));
    }
    return acc;
  }, [] as string[]);

  // Load state from cache
  useEffect(() => {
    if (!playgroundCache) return;

    const {
      messages: cachedMessages,
      modelParams: cachedModelParams,
      output: cachedOutput,
      promptVariables: cachedPromptVariables,
      tools: cachedTools,
      structuredOutputSchema: cachedStructuredOutputSchema,
    } = playgroundCache;

    setMessages(
      cachedMessages.map((m) => ({
        ...m,
        id: "id" in m ? m.id || uuidv4() : uuidv4(),
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

    if (cachedTools) {
      setTools(cachedTools);
    }

    if (cachedStructuredOutputSchema) {
      setStructuredOutputSchema(cachedStructuredOutputSchema);
    }
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
        setOutputJson("");
        setOutputToolCalls([]);

        const finalMessages = getFinalMessages(
          promptVariables,
          messages,
          messagePlaceholders,
        );
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
                  (m): m is { type: "text"; text: string } => m.type === "text",
                )?.text as string);

          setOutput(displayContent);
          setOutputToolCalls(completion.tool_calls);

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
            response = await getChatCompletionNonStreaming(
              projectId,
              finalMessages,
              modelParams,
            );
            setOutput(response);
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
        alert(err instanceof Error ? err.message : "An error occurred");
        // TODO: add error handling via toast
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

        output,
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

const getChatCompletionStream = async function* (
  projectId: string,
  messages: ChatMessage[],
  modelParams: UIModelParams,
) {
  const resp = await fetch(
    `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/chatCompletion`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        messages,
        modelParams: getFinalModelParams(modelParams),
        streaming: true,
      }),
    },
  );

  if (!resp.ok) {
    throw new Error(await resp.text());
  }

  if (!resp.body) throw new Error("No response body");

  const reader = resp.body.getReader();

  try {
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += new TextDecoder().decode(value);
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.trim() === "" || !line.startsWith("data: ")) continue;

        const data = line.slice(6);
        if (data === "[DONE]") return;

        try {
          const parsed = JSON.parse(data);
          if (parsed.choices?.[0]?.delta?.content) {
            yield parsed.choices[0].delta.content;
          }
        } catch {
          // Ignore parsing errors for malformed chunks
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
};

const getChatCompletionNonStreaming = async (
  projectId: string,
  messages: ChatMessage[],
  modelParams: UIModelParams,
): Promise<string> => {
  const resp = await fetch(
    `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/chatCompletion`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        messages,
        modelParams: getFinalModelParams(modelParams),
        streaming: false,
      }),
    },
  );

  if (!resp.ok) {
    throw new Error(await resp.text());
  }

  const data = await resp.json();
  return data.choices[0]?.message?.content || "";
};

const getChatCompletionWithTools = async (
  projectId: string,
  messages: ChatMessage[],
  modelParams: UIModelParams,
  tools: PlaygroundTool[],
  streaming: boolean,
): Promise<ToolCallResponse> => {
  const resp = await fetch(
    `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/chatCompletion`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        messages,
        modelParams: getFinalModelParams(modelParams),
        tools: tools.map((t) => ({
          type: "function",
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        })),
        streaming,
      }),
    },
  );

  if (!resp.ok) {
    throw new Error(await resp.text());
  }

  const data = await resp.json();
  const message = data.choices[0]?.message;

  if (!message) {
    throw new Error("No message in response");
  }

  return ToolCallResponseSchema.parse({
    content: message.content || "",
    tool_calls:
      message.tool_calls?.map((tc: any) => ({
        name: tc.function.name,
        id: tc.id,
        args:
          typeof tc.function.arguments === "string"
            ? JSON.parse(tc.function.arguments)
            : tc.function.arguments,
      })) || [],
  });
};

const getChatCompletionWithStructuredOutput = async (
  projectId: string,
  messages: ChatMessage[],
  modelParams: UIModelParams,
  schema: PlaygroundSchema,
  streaming: boolean,
): Promise<string> => {
  const resp = await fetch(
    `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/chatCompletion`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        messages,
        modelParams: getFinalModelParams(modelParams),
        response_format: {
          type: "json_schema",
          json_schema: {
            name: schema.name,
            schema: schema.schema,
          },
        },
        streaming,
      }),
    },
  );

  if (!resp.ok) {
    throw new Error(await resp.text());
  }

  const data = await resp.json();
  return data.choices[0]?.message?.content || "";
};

const getOutputJson = (
  response: string,
  messages: ChatMessage[],
  modelParams: UIModelParams,
  tools: PlaygroundTool[],
  structuredOutputSchema: PlaygroundSchema | null,
): string => {
  const baseOutput = {
    model: modelParams.model.value,
    messages,
    ...getFinalModelParams(modelParams),
  };

  if (tools.length > 0) {
    return JSON.stringify(
      {
        ...baseOutput,
        tools: tools.map((t) => ({
          type: "function",
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        })),
      },
      null,
      2,
    );
  }

  if (structuredOutputSchema) {
    return JSON.stringify(
      {
        ...baseOutput,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: structuredOutputSchema.name,
            schema: structuredOutputSchema.schema,
          },
        },
      },
      null,
      2,
    );
  }

  return JSON.stringify(baseOutput, null, 2);
};
