import React, { createContext, useContext, useMemo, useCallback } from "react";

import { useMultiPlaygroundContext } from "@/src/features/playground/page/context/multi-playground-context";
import { type PlaygroundColumnState } from "@/src/features/playground/page/types";
import {
  type ChatMessageWithId,
  type PromptVariable,
  type UIModelParams,
  type LLMToolCall,
  ChatMessageType,
} from "@langfuse/shared";
import { type MessagesContext } from "@/src/components/ChatMessages/types";
import { type ModelParamsContext } from "@/src/components/ModelParameters";

// This interface matches the original PlaygroundContextType but for a single column
interface ColumnPlaygroundContextType
  extends MessagesContext,
    ModelParamsContext {
  // Column-specific state
  columnId: string;
  tools: PlaygroundColumnState["tools"];
  setTools: (tools: PlaygroundColumnState["tools"]) => void;
  structuredOutputSchema: PlaygroundColumnState["structuredOutputSchema"];
  setStructuredOutputSchema: (
    schema: PlaygroundColumnState["structuredOutputSchema"],
  ) => void;
  output: string;
  outputJson: string;
  outputToolCalls: LLMToolCall[];
  isStreaming: boolean;

  // Global state (shared across columns)
  promptVariables: PromptVariable[];
  updatePromptVariableValue: (variable: string, value: string) => void;
  deletePromptVariable: (variable: string) => void;

  // Execution (placeholder - individual column execution not implemented yet)
  handleSubmit: (streaming?: boolean) => Promise<void>;

  // Message placeholders
  messagePlaceholders: PlaygroundColumnState["messagePlaceholders"];
  updateMessagePlaceholderValue: (name: string, value: any) => void;
  deleteMessagePlaceholder: (name: string) => void;
}

const ColumnPlaygroundContext = createContext<
  ColumnPlaygroundContextType | undefined
>(undefined);

export const useColumnPlaygroundContext = () => {
  const context = useContext(ColumnPlaygroundContext);
  if (!context) {
    throw new Error(
      "useColumnPlaygroundContext must be used within a PlaygroundColumnProvider",
    );
  }
  return context;
};

interface PlaygroundColumnProviderProps {
  columnId: string;
  children: React.ReactNode;
}

export const PlaygroundColumnProvider: React.FC<
  PlaygroundColumnProviderProps
> = ({ columnId, children }) => {
  const {
    columns,
    updateColumnState,
    updateColumnMessages,
    updateColumnModelParams,
    updateColumnTools,
    updateColumnSchema,
    updateColumnMessagePlaceholders,
    promptVariables,
    updatePromptVariableValue,
    deletePromptVariable,
    availableProviders,
    availableModels,
    handleSubmitAll,
  } = useMultiPlaygroundContext();

  // Find the current column
  const column = columns.find((col) => col.id === columnId);

  if (!column) {
    throw new Error(`Column with id ${columnId} not found`);
  }

  // Messages context methods
  const addMessage: MessagesContext["addMessage"] = useCallback(
    (message) => {
      const newMessage = { ...message, id: crypto.randomUUID() };
      const updatedMessages = [...column.messages, newMessage];
      updateColumnMessages(columnId, updatedMessages);
      return newMessage;
    },
    [column.messages, columnId, updateColumnMessages],
  );

  const updateMessage: MessagesContext["updateMessage"] = useCallback(
    (_, id, key, value) => {
      const updatedMessages = column.messages.map((msg) =>
        msg.id === id ? { ...msg, [key]: value } : msg,
      );
      updateColumnMessages(columnId, updatedMessages);
    },
    [column.messages, columnId, updateColumnMessages],
  );

  const replaceMessage: MessagesContext["replaceMessage"] = useCallback(
    (id, message) => {
      const updatedMessages = column.messages.map((msg) =>
        msg.id === id ? { id, ...message } : msg,
      );
      updateColumnMessages(columnId, updatedMessages);
    },
    [column.messages, columnId, updateColumnMessages],
  );

  const deleteMessage: MessagesContext["deleteMessage"] = useCallback(
    (id) => {
      const updatedMessages = column.messages.filter((msg) => msg.id !== id);
      updateColumnMessages(columnId, updatedMessages);
    },
    [column.messages, columnId, updateColumnMessages],
  );

  const setMessages = useCallback(
    (messages: ChatMessageWithId[]) => {
      updateColumnMessages(columnId, messages);
    },
    [columnId, updateColumnMessages],
  );

  // Model params context methods
  const updateModelParamValue: ModelParamsContext["updateModelParamValue"] =
    useCallback(
      (key, value) => {
        const updatedParams = { ...column.modelParams, [key]: value };
        updateColumnModelParams(columnId, updatedParams);
      },
      [column.modelParams, columnId, updateColumnModelParams],
    );

  const setModelParamEnabled: ModelParamsContext["setModelParamEnabled"] =
    useCallback(
      (key: keyof UIModelParams, enabled: boolean) => {
        const currentParam = column.modelParams[key];
        const updatedParams = {
          ...column.modelParams,
          [key]: { ...currentParam, enabled },
        };
        updateColumnModelParams(columnId, updatedParams);
      },
      [column.modelParams, columnId, updateColumnModelParams],
    );

  // Tools methods
  const setTools = useCallback(
    (tools: PlaygroundColumnState["tools"]) => {
      updateColumnTools(columnId, tools);
    },
    [columnId, updateColumnTools],
  );

  // Structured output methods
  const setStructuredOutputSchema = useCallback(
    (schema: PlaygroundColumnState["structuredOutputSchema"]) => {
      updateColumnSchema(columnId, schema);
    },
    [columnId, updateColumnSchema],
  );

  // Message placeholders methods
  const updateMessagePlaceholderValue = useCallback(
    (name: string, value: any) => {
      const updatedPlaceholders = column.messagePlaceholders.map((p) =>
        p.name === name ? { ...p, value } : p,
      );
      updateColumnMessagePlaceholders(columnId, updatedPlaceholders);
    },
    [column.messagePlaceholders, columnId, updateColumnMessagePlaceholders],
  );

  const deleteMessagePlaceholder = useCallback(
    (name: string) => {
      const updatedPlaceholders = column.messagePlaceholders.filter(
        (p) => p.name !== name,
      );
      updateColumnMessagePlaceholders(columnId, updatedPlaceholders);
    },
    [column.messagePlaceholders, columnId, updateColumnMessagePlaceholders],
  );

  // Individual column submission (placeholder)
  const handleSubmit = useCallback(
    async (streaming = true) => {
      // For now, just trigger the global submit
      // TODO: Implement individual column execution if needed
      await handleSubmitAll(streaming);
    },
    [handleSubmitAll],
  );

  // Tool call IDs for the current column
  const toolCallIds = useMemo(() => {
    return column.messages.reduce((acc, m) => {
      if (m.type === ChatMessageType.AssistantToolCall && "toolCalls" in m) {
        acc.push(...m.toolCalls.map((tc: any) => tc.id));
      }
      return acc;
    }, [] as string[]);
  }, [column.messages]);

  const contextValue: ColumnPlaygroundContextType = {
    // Column identity
    columnId,

    // Messages context
    messages: column.messages,
    addMessage,
    setMessages,
    updateMessage,
    replaceMessage,
    deleteMessage,
    toolCallIds,

    // Model params context
    modelParams: column.modelParams,
    updateModelParamValue,
    setModelParamEnabled,
    availableProviders,
    availableModels,

    // Column-specific state
    tools: column.tools,
    setTools,
    structuredOutputSchema: column.structuredOutputSchema,
    setStructuredOutputSchema,
    output: column.output,
    outputJson: column.outputJson,
    outputToolCalls: column.outputToolCalls,
    isStreaming: column.isStreaming,

    // Global state
    promptVariables,
    updatePromptVariableValue,
    deletePromptVariable,

    // Message placeholders
    messagePlaceholders: column.messagePlaceholders,
    updateMessagePlaceholderValue,
    deleteMessagePlaceholder,

    // Execution
    handleSubmit,
  };

  return (
    <ColumnPlaygroundContext.Provider value={contextValue}>
      {children}
    </ColumnPlaygroundContext.Provider>
  );
};

// Export a hook that works with the column context
export const usePlaygroundContext = () => {
  const columnContext = useContext(ColumnPlaygroundContext);
  if (!columnContext) {
    throw new Error(
      "usePlaygroundContext must be used within a PlaygroundColumnProvider",
    );
  }
  return columnContext;
};
