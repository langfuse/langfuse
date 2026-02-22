import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { v4 as uuidv4 } from "uuid";

import { env } from "@/src/env.mjs";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { parsePromptFromResponse } from "@/src/features/meta-prompt/utils/parsePromptFromResponse";
import type {
  MetaPromptContextType,
  MetaPromptMessage,
  TargetPlatform,
} from "@/src/features/meta-prompt/types";
import { ChatMessageRole, ChatMessageType } from "@langfuse/shared";
import type { UIModelParams } from "@langfuse/shared";
import { getFinalModelParams } from "@/src/utils/getFinalModelParams";

const MetaPromptContext = createContext<MetaPromptContextType | undefined>(
  undefined,
);

export const useMetaPromptContext = () => {
  const context = useContext(MetaPromptContext);
  if (!context) {
    throw new Error(
      "useMetaPromptContext must be used within a MetaPromptProvider",
    );
  }
  return context;
};

type MetaPromptProviderProps = {
  children: React.ReactNode;
  modelParams: UIModelParams;
  promptFormRef: React.RefObject<{
    setTextPrompt: (content: string) => void;
  } | null>;
};

export const MetaPromptProvider: React.FC<MetaPromptProviderProps> = ({
  children,
  modelParams,
  promptFormRef,
}) => {
  const projectId = useProjectIdFromURL();
  const [chatHistory, setChatHistory] = useState<MetaPromptMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [latestImprovedPrompt, setLatestImprovedPrompt] = useState<
    string | null
  >(null);
  const [targetPlatform, setTargetPlatform] =
    useState<TargetPlatform>("generic");

  const abortControllerRef = useRef<AbortController | null>(null);

  const stopStreaming = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsStreaming(false);
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!projectId) {
        showErrorToast("Error", "Project ID is not set");
        return;
      }

      if (!modelParams.provider.value || !modelParams.model.value) {
        showErrorToast("Error", "Please select a model first");
        return;
      }

      const userMessage: MetaPromptMessage = {
        id: uuidv4(),
        role: "user",
        content,
        timestamp: new Date(),
      };

      setChatHistory((prev) => [...prev, userMessage]);

      const assistantMessage: MetaPromptMessage = {
        id: uuidv4(),
        role: "assistant",
        content: "",
        timestamp: new Date(),
      };

      setChatHistory((prev) => [...prev, assistantMessage]);
      setIsStreaming(true);

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        // Build messages array for the API call using all history + new user message
        const apiMessages = [
          ...chatHistory
            .filter((msg) => msg.content.length > 0)
            .map((msg) => ({
              type:
                msg.role === "user"
                  ? (ChatMessageType.User as const)
                  : (ChatMessageType.AssistantText as const),
              role:
                msg.role === "user"
                  ? (ChatMessageRole.User as const)
                  : (ChatMessageRole.Assistant as const),
              content: msg.content,
            })),
          {
            type: ChatMessageType.User as const,
            role: ChatMessageRole.User as const,
            content,
          },
        ];

        const finalParams = getFinalModelParams(modelParams);

        const response = await fetch(
          `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/metaPromptCompletion`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              projectId,
              messages: apiMessages,
              modelParams: finalParams,
              targetPlatform,
              streaming: true,
            }),
            signal: abortController.signal,
          },
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            errorData.message ||
              `Request failed with status ${response.status}`,
          );
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("Failed to read response body");
        }

        const decoder = new TextDecoder("utf-8");
        let fullResponse = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const token = decoder.decode(value);
            fullResponse += token;

            setChatHistory((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessage.id
                  ? { ...msg, content: fullResponse }
                  : msg,
              ),
            );
          }
        } finally {
          reader.releaseLock();
        }

        // Parse the response for improved prompt
        const parsed = parsePromptFromResponse(fullResponse);
        if (parsed.improvedPrompt) {
          setLatestImprovedPrompt(parsed.improvedPrompt);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          // User stopped streaming, keep partial response
          return;
        }
        const errorMessage =
          err instanceof Error ? err.message : "An error occurred";
        showErrorToast("Error", errorMessage);

        // Remove the empty assistant message if there was an error
        setChatHistory((prev) =>
          prev.filter(
            (msg) => msg.id !== assistantMessage.id || msg.content.length > 0,
          ),
        );
      } finally {
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    },
    [projectId, modelParams, chatHistory, targetPlatform],
  );

  const applyToEditor = useCallback(() => {
    if (latestImprovedPrompt && promptFormRef.current) {
      promptFormRef.current.setTextPrompt(latestImprovedPrompt);
    }
  }, [latestImprovedPrompt, promptFormRef]);

  return (
    <MetaPromptContext.Provider
      value={{
        chatHistory,
        sendMessage,
        isStreaming,
        stopStreaming,
        selectedProvider: modelParams.provider.value,
        setSelectedProvider: () => {},
        selectedModel: modelParams.model.value,
        setSelectedModel: () => {},
        targetPlatform,
        setTargetPlatform,
        latestImprovedPrompt,
        applyToEditor,
      }}
    >
      {children}
    </MetaPromptContext.Provider>
  );
};
