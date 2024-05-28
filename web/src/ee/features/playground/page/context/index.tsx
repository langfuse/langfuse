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
import useCommandEnter from "@/src/ee/features/playground/page/hooks/useCommandEnter";
import usePlaygroundCache from "@/src/ee/features/playground/page/hooks/usePlaygroundCache";
import { getFinalModelParams } from "@/src/ee/utils/getFinalModelParams";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { extractVariables } from "@/src/utils/string";
import {
  ChatMessageRole,
  type ChatMessageWithId,
  ModelProvider,
  type PromptVariable,
  type UIModelParams,
} from "@langfuse/shared";

import type { MessagesContext } from "@/src/components/ChatMessages/types";
import type { ModelParamsContext } from "@/src/components/ModelParameters";

type PlaygroundContextType = {
  promptVariables: PromptVariable[];
  updatePromptVariableValue: (variable: string, value: string) => void;
  deletePromptVariable: (variable: string) => void;

  output: string;
  outputJson: string;

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
  const [outputJson, setOutputJson] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [messages, setMessages] = useState<ChatMessageWithId[]>([
    createEmptyMessage(ChatMessageRole.System),
    createEmptyMessage(ChatMessageRole.User),
  ]);
  const [modelParams, setModelParams] = useState<UIModelParams>(
    getDefaultModelParams(ModelProvider.OpenAI),
  );

  // Load state from cache
  useEffect(() => {
    if (!playgroundCache) return;

    const {
      messages: cachedMessages,
      modelParams: cachedModelParams,
      output: cachedOutput,
      promptVariables: cachedPromptVariables,
    } = playgroundCache;

    setMessages(cachedMessages.map((m) => ({ ...m, id: uuidv4() })));

    if (cachedOutput) {
      setOutput(cachedOutput);
      setOutputJson("");
    }

    if (cachedModelParams) {
      setModelParams((prev) => ({ ...prev, ...cachedModelParams }));
    }

    if (cachedPromptVariables) {
      setPromptVariables(cachedPromptVariables);
    }
  }, [playgroundCache]);

  useEffect(() => {
    setModelParams(getDefaultModelParams(modelParams.provider.value));
  }, [modelParams.provider.value]);

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

  const addMessage: PlaygroundContextType["addMessage"] = (role, content) => {
    const message = createEmptyMessage(role, content);
    setMessages((prev) => [...prev, message]);

    return message;
  };

  const updateMessage: PlaygroundContextType["updateMessage"] = (
    id,
    key,
    value,
  ) => {
    setMessages((prev) =>
      prev.map((message) =>
        message.id === id ? { ...message, [key]: value } : message,
      ),
    );
  };

  const deleteMessage: PlaygroundContextType["deleteMessage"] = (id) => {
    setMessages((prev) => prev.filter((message) => message.id !== id));
  };

  const handleSubmit: PlaygroundContextType["handleSubmit"] =
    useCallback(async () => {
      try {
        setIsStreaming(true);
        setOutput("");
        setOutputJson("");

        const finalMessages = getFinalMessages(promptVariables, messages);
        const leftOverVariables = extractVariables(
          finalMessages.map((m) => m.content).join("\n"),
        );

        if (leftOverVariables.length > 0) {
          throw Error("Error replacing variables. Please check your inputs.");
        }

        const completionStream = getChatCompletionStream(
          projectId,
          finalMessages,
          modelParams,
        );

        let response = "";
        for await (const token of completionStream) {
          response += token;
          setOutput(response);
        }
        setOutputJson(getOutputJson(response, finalMessages, modelParams));
        setPlaygroundCache({
          messages,
          modelParams,
          output: response,
          promptVariables,
        });
        capture("playground:execute_button_click", {
          inputLength: finalMessages.length,
          modelName: modelParams.model,
          modelProvider: modelParams.provider,
          outputLength: response.length,
        });
      } catch (err) {
        console.error(err);

        alert(err instanceof Error ? err.message : "An error occurred");
        // TODO: add error handling via toast
      } finally {
        setIsStreaming(false);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [messages, modelParams, promptVariables]);

  useCommandEnter(!isStreaming, handleSubmit);

  const updateModelParamValue: PlaygroundContextType["updateModelParamValue"] =
    (key, value) => {
      setModelParams((prev) => ({
        ...prev,
        [key]: { ...prev[key], value },
      }));
    };

  const setModelParamEnabled: PlaygroundContextType["setModelParamEnabled"] = (
    key,
    enabled,
  ) => {
    setModelParams((prev) => ({
      ...prev,
      [key]: { ...prev[key], enabled },
    }));
  };

  const updatePromptVariableValue = (variable: string, value: string) => {
    setPromptVariables((prev) =>
      prev.map((v) => (v.name === variable ? { ...v, value } : v)),
    );
  };

  const deletePromptVariable = (variable: string) => {
    setPromptVariables((prev) => prev.filter((v) => v.name !== variable));
  };

  return (
    <PlaygroundContext.Provider
      value={{
        promptVariables,
        updatePromptVariableValue,
        deletePromptVariable,

        messages,
        addMessage,
        updateMessage,
        deleteMessage,

        modelParams,
        updateModelParamValue,
        setModelParamEnabled,

        output,
        outputJson,
        handleSubmit,
        isStreaming,
      }}
    >
      {children}
    </PlaygroundContext.Provider>
  );
};

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
  const result = await fetch("/api/chatCompletion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

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
  const finalMessages = messages.map((m) => {
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

function getDefaultModelParams(provider: ModelProvider): UIModelParams {
  switch (provider) {
    // Docs: https://platform.openai.com/docs/api-reference/chat/create
    case ModelProvider.OpenAI:
      return {
        provider: {
          value: provider,
          enabled: true,
        },
        model: { value: "gpt-3.5-turbo", enabled: true },
        temperature: { value: 1, enabled: true },
        maxTemperature: { value: 2, enabled: true },
        max_tokens: { value: 256, enabled: true },
        top_p: { value: 1, enabled: true },
      };

    // Docs: https://docs.anthropic.com/claude/reference/messages_post
    case ModelProvider.Anthropic:
      return {
        provider: {
          value: provider,
          enabled: true,
        },
        model: { value: "claude-3-opus-20240229", enabled: true },
        temperature: { value: 0, enabled: true },
        maxTemperature: { value: 1, enabled: true },
        max_tokens: { value: 256, enabled: true },
        top_p: { value: 1, enabled: true },
      };
  }
}

function getOutputJson(
  output: string,
  messages: ChatMessageWithId[],
  modelParams: UIModelParams,
) {
  return JSON.stringify(
    {
      input: messages.map((obj) => filterKeyFromObject(obj, "id")),
      output,
      model: getFinalModelParams(modelParams),
    },
    null,
    2,
  );
}

function filterKeyFromObject<T extends object>(obj: T, key: keyof T) {
  return Object.fromEntries(Object.entries(obj).filter(([k, _]) => k !== key));
}
