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
import useCommandEnter from "@/src/features/playground/page/hooks/useCommandEnter";
import { useModelParams } from "@/src/features/playground/page/hooks/useModelParams";
import usePlaygroundCache from "@/src/features/playground/page/hooks/usePlaygroundCache";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import {
  ChatMessageRole,
  extractVariables,
  type ChatMessageWithId,
  type PromptVariable,
  ToolCallResponseSchema,
  type UIModelParams,
  type ToolCallResponse,
  type LLMToolDefinition,
  type LLMToolCall,
  ChatMessageType,
} from "@langfuse/shared";

import type { MessagesContext } from "@/src/components/ChatMessages/types";
import type { ModelParamsContext } from "@/src/components/ModelParameters";
import { env } from "@/src/env.mjs";
import {
  type PlaygroundSchema,
  type PlaygroundTool,
} from "@/src/features/playground/page/types";
import { getFinalModelParams } from "@/src/utils/getFinalModelParams";

type PlaygroundContextType = {
  promptVariables: PromptVariable[];
  updatePromptVariableValue: (variable: string, value: string) => void;
  deletePromptVariable: (variable: string) => void;

  tools: PlaygroundTool[];
  setTools: React.Dispatch<React.SetStateAction<PlaygroundTool[]>>;

  structuredOutputSchema: PlaygroundSchema | null;
  setStructuredOutputSchema: (schema: PlaygroundSchema | null) => void;

  output: string;
  outputJson: string;
  outputToolCalls: LLMToolCall[];

  handleSubmit: () => Promise<void>;
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

    setMessages(cachedMessages.map((m) => ({ ...m, id: uuidv4() })));

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
    const messageContents = messages.map((m) => m.content).join("\n");
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

  const handleSubmit: PlaygroundContextType["handleSubmit"] =
    useCallback(async () => {
      try {
        setIsStreaming(true);
        setOutput("");
        setOutputJson("");
        setOutputToolCalls([]);

        const finalMessages = getFinalMessages(promptVariables, messages);
        const leftOverVariables = extractVariables(
          finalMessages.map((m) => m.content).join("\n"),
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
          );

          setOutput(response);
        } else {
          const completionStream = getChatCompletionStream(
            projectId,
            finalMessages,
            modelParams,
          );

          for await (const token of completionStream) {
            response += token;
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
        console.error(err);

        alert(err instanceof Error ? err.message : "An error occurred");
        // TODO: add error handling via toast
      } finally {
        setIsStreaming(false);
      }
    }, [
      messages,
      modelParams,
      promptVariables,
      tools,
      capture,
      setPlaygroundCache,
      structuredOutputSchema,
      projectId,
    ]);

  useCommandEnter(!isStreaming, handleSubmit);

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

  return (
    <PlaygroundContext.Provider
      value={{
        promptVariables,
        updatePromptVariableValue,
        deletePromptVariable,

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

async function getChatCompletionWithTools(
  projectId: string | undefined,
  messages: ChatMessageWithId[],
  modelParams: UIModelParams,
  tools: unknown[],
): Promise<ToolCallResponse> {
  if (!projectId) throw Error("Project ID is not set");

  const body = JSON.stringify({
    projectId,
    messages,
    modelParams: getFinalModelParams(modelParams),
    tools,
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

  return parsed.data;
}

async function getChatCompletionWithStructuredOutput(
  projectId: string | undefined,
  messages: ChatMessageWithId[],
  modelParams: UIModelParams,
  structuredOutputSchema: PlaygroundSchema | null,
): Promise<string> {
  if (!projectId) throw Error("Project ID is not set");

  const body = JSON.stringify({
    projectId,
    messages,
    modelParams: getFinalModelParams(modelParams),
    structuredOutputSchema: structuredOutputSchema?.schema,
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

  const body = JSON.stringify({
    projectId,
    messages,
    modelParams: getFinalModelParams(modelParams),
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

function getFinalMessages(
  promptVariables: PromptVariable[],
  messages: ChatMessageWithId[],
) {
  const missingVariables = promptVariables.filter((v) => !v.value && v.isUsed);
  if (missingVariables.length > 0) {
    throw new Error(
      `Please set a value for the following variables: ${missingVariables
        .map((v) => v.name)
        .join(", ")}`,
    );
  }

  // Dynamically replace variables in the prompt
  const finalMessages = messages
    .filter(
      (m) =>
        m.content.length > 0 || ("toolCalls" in m && m.toolCalls.length > 0),
    )
    .map((m) => {
      let content = m.content;
      for (const variable of promptVariables) {
        content = content.replace(
          new RegExp(`{{\\s*${variable.name}\\s*}}`, "g"),
          variable.value,
        );
      }

      return { ...m, content };
    });
  return finalMessages;
}

function getOutputJson(
  output: string,
  messages: ChatMessageWithId[],
  modelParams: UIModelParams,
  tools: LLMToolDefinition[],
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
