import React, { useMemo, createContext, useContext } from "react";
import {
  type PlaygroundColumnState,
  type PlaygroundTool,
  type PlaygroundSchema,
} from "@/src/features/playground/page/types";
import { useMultiPlaygroundContext } from "@/src/features/playground/page/context/multi-playground-context";
import type { ChatMessageWithId } from "@langfuse/shared";
import type { MessagesContext } from "@/src/components/ChatMessages/types";
import type { ModelParamsContext } from "@/src/components/ModelParameters";

// Re-create the PlaygroundContext locally since it's not exported
const PlaygroundContext = createContext<any>(undefined);

interface PlaygroundColumnProviderProps {
  columnState: PlaygroundColumnState;
  onStateChange: (updates: Partial<PlaygroundColumnState>) => void;
  children: React.ReactNode;
}

export const PlaygroundColumnProvider: React.FC<PlaygroundColumnProviderProps> = ({
  columnState,
  onStateChange,
  children,
}) => {
  const { 
    state: globalState, 
    updatePromptVariable,
    deletePromptVariable,
    updateMessagePlaceholder,
    deleteMessagePlaceholder,
    availableProviders,
    availableModels,
    executeColumn,
  } = useMultiPlaygroundContext();

  // Create context value that adapts column state to PlaygroundContext interface
  const contextValue = useMemo(() => {
    // Messages context implementation
    const messagesContext: MessagesContext = {
      messages: columnState.messages,
      setMessages: (messages: ChatMessageWithId[] | ((prev: ChatMessageWithId[]) => ChatMessageWithId[])) => {
        if (typeof messages === 'function') {
          onStateChange({ messages: messages(columnState.messages) });
        } else {
          onStateChange({ messages });
        }
      },
      addMessage: (message) => {
        // Implementation similar to original PlaygroundContext
        const newMessage = { ...message, id: crypto.randomUUID() } as ChatMessageWithId;
        onStateChange({ messages: [...columnState.messages, newMessage] });
        return newMessage;
      },
      updateMessage: (_, id, key, value) => {
        const updatedMessages = columnState.messages.map(msg =>
          msg.id === id ? { ...msg, [key]: value } : msg
        );
        onStateChange({ messages: updatedMessages });
      },
      replaceMessage: (id, message) => {
        const updatedMessages = columnState.messages.map(msg =>
          msg.id === id ? { id, ...message } as ChatMessageWithId : msg
        );
        onStateChange({ messages: updatedMessages });
      },
      deleteMessage: (id) => {
        const updatedMessages = columnState.messages.filter(msg => msg.id !== id);
        onStateChange({ messages: updatedMessages });
      },
      toolCallIds: columnState.messages.reduce((acc, m) => {
        if ('toolCalls' in m && m.toolCalls) {
          acc.push(...m.toolCalls.map((tc: any) => tc.id));
        }
        return acc;
      }, [] as string[]),
    };

    // Model params context implementation
    const modelParamsContext: ModelParamsContext = {
      modelParams: columnState.modelParams,
      availableProviders,
      availableModels,
      updateModelParamValue: (key, value) => {
        onStateChange({
          modelParams: {
            ...columnState.modelParams,
            [key]: { ...columnState.modelParams[key], value },
          },
        });
      },
      setModelParamEnabled: (key, enabled) => {
        onStateChange({
          modelParams: {
            ...columnState.modelParams,
            [key]: { ...columnState.modelParams[key], enabled },
          },
        });
      },
    };

    return {
      // Global state (shared across columns)
      promptVariables: globalState.promptVariables,
      updatePromptVariableValue: updatePromptVariable,
      deletePromptVariable,
      
      messagePlaceholders: globalState.messagePlaceholders,
      updateMessagePlaceholderValue: updateMessagePlaceholder,
      deleteMessagePlaceholder,

      // Column-specific state
      tools: columnState.tools,
      setTools: (tools: PlaygroundTool[] | ((prev: PlaygroundTool[]) => PlaygroundTool[])) => {
        if (typeof tools === 'function') {
          onStateChange({ tools: tools(columnState.tools) });
        } else {
          onStateChange({ tools });
        }
      },

      structuredOutputSchema: columnState.structuredOutputSchema,
      setStructuredOutputSchema: (schema: PlaygroundSchema | null) => {
        onStateChange({ structuredOutputSchema: schema });
      },

      output: columnState.output,
      outputJson: columnState.outputJson,
      outputToolCalls: columnState.outputToolCalls,

      handleSubmit: async (streaming = true) => {
        // Delegate to the multi-playground context's executeColumn
        await executeColumn(columnState.id, streaming);
      },

      isStreaming: columnState.isStreaming,

      // Spread messages and model params contexts
      ...messagesContext,
      ...modelParamsContext,
    };
  }, [
    columnState,
    onStateChange,
    globalState.promptVariables,
    globalState.messagePlaceholders,
    updatePromptVariable,
    deletePromptVariable,
    updateMessagePlaceholder,
    deleteMessagePlaceholder,
    availableProviders,
    availableModels,
    executeColumn,
  ]);

  return (
    <PlaygroundContext.Provider value={contextValue}>
      {children}
    </PlaygroundContext.Provider>
  );
};

// Export a hook to use the context
export const usePlaygroundContext = () => {
  const context = useContext(PlaygroundContext);
  if (!context) {
    throw new Error(
      "usePlaygroundContext must be used within a PlaygroundColumnProvider",
    );
  }
  return context;
};