import React, {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { v4 as uuidv4 } from "uuid";

import { MessagesContext } from "@/src/features/playground/client/components/Messages";
import { ModelParamsContext } from "@/src/features/playground/client/components/ModelParameters";
import useCommandEnter from "@/src/features/playground/client/hooks/useCommandEnter";
import { extractVariables } from "@/src/utils/string";
import {
  ChatMessageRole,
  ChatMessageWithId,
  ModelProvider,
  PromptVariable,
  UIModelParams,
} from "@langfuse/shared";

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

  useEffect(() => {
    setModelParams(getDefaultModelParams(modelParams.provider));
  }, [modelParams.provider]);

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
          finalMessages.map((m) => m.content).join(""),
        );

        if (leftOverVariables.length > 0) {
          throw Error("Error replacing variables. Please check your inputs.");
        }

        const completionStream = getChatCompletionStream(
          finalMessages,
          modelParams,
        );

        let response = "";
        for await (const token of completionStream) {
          response += token;
          setOutput(response);
        }
        setOutputJson(getOutputJson(response, finalMessages, modelParams));
      } catch (err) {
        console.error(err);

        alert(err instanceof Error ? err.message : "An error occurred");
        // TODO: add error handling via toast
      } finally {
        setIsStreaming(false);
      }
    }, [messages, modelParams, promptVariables]);

  useCommandEnter(!isStreaming, handleSubmit);

  const updateModelParams: PlaygroundContextType["updateModelParams"] = (
    key,
    value,
  ) => {
    setModelParams((prev) => ({ ...prev, [key]: value }));
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
        updatePromptVariables,
        updatePromptVariableValue,
        deletePromptVariable,

        messages,
        addMessage,
        updateMessage,
        deleteMessage,

        modelParams,
        updateModelParams,

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
  messages: ChatMessageWithId[],
  modelParams: UIModelParams,
) {
  const body = JSON.stringify({ messages, modelParams });
  const result = await fetch("/api/chatCompletion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  if (!result.ok) {
    throw new Error("Failed to fetch data: " + result.statusText);
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

function createEmptyMessage(
  role: ChatMessageRole,
  content?: string,
): ChatMessageWithId {
  return {
    role,
    content: content ?? "",
    id: uuidv4(),
  };
}

function getDefaultModelParams(provider: ModelProvider): UIModelParams {
  switch (provider) {
    // Docs: https://platform.openai.com/docs/api-reference/chat/create
    case ModelProvider.OpenAI:
      return {
        provider,
        model: "gpt-3.5-turbo",
        temperature: 1,
        maxTemperature: 2,
        max_tokens: 256,
        top_p: 1,
      };

    // Docs: https://docs.anthropic.com/claude/reference/messages_post
    case ModelProvider.Anthropic:
      return {
        provider,
        model: "claude-3-opus-20240229",
        temperature: 0,
        maxTemperature: 1,
        max_tokens: 256,
        top_p: 1,
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
      output,
      input: messages.map((obj) => filterKeyFromObject(obj, "id")),
      model: filterKeyFromObject(modelParams, "maxTemperature"),
    },
    null,
    2,
  );
}

function filterKeyFromObject<T extends object>(obj: T, key: keyof T) {
  return Object.fromEntries(Object.entries(obj).filter(([k, _]) => k !== key));
}
