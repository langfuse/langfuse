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
  type ChatMessage,
  type ChatMessageWithId,
  type PromptVariable,
  type UIModelParams,
  ChatMessageType,
  compileChatMessagesWithIds,
  ToolCallResponseSchema,
  type LLMToolCall,
} from "@langfuse/shared";

import {
  type PlaygroundColumnState,
  type MultiPlaygroundState,
  type PlaygroundSchema,
  type PlaceholderMessageFillIn,
  type MultiPlaygroundCache,
} from "@/src/features/playground/page/types";
import { getFinalModelParams } from "@/src/utils/getFinalModelParams";
import { env } from "@/src/env.mjs";
import type { 
  ChatMessageWithIdNoPlaceholders,
  MessagePlaceholderValues,
  LLMToolDefinition,
  ToolCallResponse,
} from "@langfuse/shared";

type MultiPlaygroundContextType = {
  state: MultiPlaygroundState;
  
  // Column management
  addColumn: () => void;
  removeColumn: (columnId: string) => void;
  duplicateColumn: (columnId: string) => void;
  
  // Column state updates
  updateColumnState: (columnId: string, updates: Partial<PlaygroundColumnState>) => void;
  
  // Sync management
  toggleColumnSync: (columnId: string, category: keyof PlaygroundColumnState['syncFlags']) => void;
  toggleGlobalSync: () => void;
  
  // Global state
  updatePromptVariable: (name: string, value: string) => void;
  deletePromptVariable: (name: string) => void;
  updateMessagePlaceholder: (name: string, value: ChatMessage[]) => void;
  deleteMessagePlaceholder: (name: string) => void;
  
  // Execution
  executeAllColumns: () => Promise<void>;
  executeColumn: (columnId: string, streaming?: boolean) => Promise<void>;
  
  // Available models/providers (global)
  availableProviders: string[];
  availableModels: string[];
};

const MultiPlaygroundContext = createContext<MultiPlaygroundContextType | undefined>(
  undefined,
);

export const useMultiPlaygroundContext = () => {
  const context = useContext(MultiPlaygroundContext);
  if (!context) {
    throw new Error(
      "useMultiPlaygroundContext must be used within a MultiPlaygroundProvider",
    );
  }
  return context;
};

// Helper to create default column state
const createDefaultColumnState = (
  id: string = uuidv4(),
  baseState?: Partial<PlaygroundColumnState>
): PlaygroundColumnState => ({
  id,
  messages: baseState?.messages ?? [
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
  ],
  modelParams: baseState?.modelParams ?? {
    provider: { value: "", enabled: true },
    model: { value: "", enabled: true },
    temperature: { value: 1, enabled: false },
    max_tokens: { value: 256, enabled: false },
    top_p: { value: 1, enabled: false },
    maxTemperature: { value: 2, enabled: true },
    adapter: { value: "openai", enabled: true },
  },
  tools: baseState?.tools ?? [],
  structuredOutputSchema: baseState?.structuredOutputSchema ?? null,
  output: baseState?.output ?? "",
  outputJson: baseState?.outputJson ?? "",
  outputToolCalls: baseState?.outputToolCalls ?? [],
  isStreaming: false,
  syncFlags: baseState?.syncFlags ?? {
    prompt: true,
    modelParams: true,
    tools: true,
    structuredOutput: true,
  },
});

export const MultiPlaygroundProvider: React.FC<PropsWithChildren> = ({
  children,
}) => {
  const capture = usePostHogClientCapture();
  const projectId = useProjectIdFromURL();
  const { playgroundCache, setPlaygroundCache } = usePlaygroundCache();
  
  const {
    modelParams: defaultModelParams,
    availableProviders,
    availableModels,
  } = useModelParams();

  // Initialize state
  const [state, setState] = useState<MultiPlaygroundState>(() => {
    // Check if we have multi-column cache
    const multiCache = playgroundCache as MultiPlaygroundCache;
    if (multiCache?.columns) {
      // Load from multi-column cache
      return {
        columns: multiCache.columns.map((col) => 
          createDefaultColumnState(
            uuidv4(),
            {
              messages: col.messages.map(m => ({ ...m, id: uuidv4() })),
              modelParams: col.modelParams ? { ...defaultModelParams, ...col.modelParams } : defaultModelParams,
              tools: col.tools ?? [],
              structuredOutputSchema: col.structuredOutputSchema ?? null,
              output: col.output ?? "",
              outputJson: "",
              outputToolCalls: [],
              syncFlags: col.syncFlags ?? {
                prompt: true,
                modelParams: true,
                tools: true,
                structuredOutput: true,
              },
            }
          )
        ),
        promptVariables: multiCache.promptVariables ?? [],
        messagePlaceholders: multiCache.messagePlaceholders ?? [],
        globalSyncEnabled: multiCache.globalSyncEnabled ?? true,
      };
    } else if (playgroundCache) {
      // Load from single-column cache into first column
      const column = createDefaultColumnState(uuidv4(), {
        messages: playgroundCache.messages.map(m => ({ ...m, id: uuidv4() })),
        modelParams: playgroundCache.modelParams ? { ...defaultModelParams, ...playgroundCache.modelParams } : defaultModelParams,
        tools: playgroundCache.tools ?? [],
        structuredOutputSchema: playgroundCache.structuredOutputSchema ?? null,
        output: playgroundCache.output ?? "",
      });
      
      return {
        columns: [column],
        promptVariables: playgroundCache.promptVariables ?? [],
        messagePlaceholders: [],
        globalSyncEnabled: true,
      };
    }
    
    // Default state with one column
    return {
      columns: [createDefaultColumnState(uuidv4(), { modelParams: defaultModelParams })],
      promptVariables: [],
      messagePlaceholders: [],
      globalSyncEnabled: true,
    };
  });

  // Update prompt variables when messages change
  useEffect(() => {
    const allMessages = state.columns.flatMap(col => col.messages);
    const messageContents = allMessages.map((m) => ('content' in m ? m.content : m.name)).join("\n");
    const variables = extractVariables(messageContents)
      .map((v) => v.trim())
      .filter(Boolean);

    setState(prev => {
      const newPromptVariables = prev.promptVariables.reduce<PromptVariable[]>((acc, v) => {
        const isUsed = variables.includes(v.name);
        if (!isUsed && !v.value) return acc;
        acc.push({ ...v, isUsed });
        return acc;
      }, []);

      // Create new variables if any
      for (const variable of variables) {
        if (!newPromptVariables.some((v) => v.name === variable)) {
          newPromptVariables.push({ name: variable, value: "", isUsed: true });
        }
      }

      return { ...prev, promptVariables: newPromptVariables };
    });
  }, [state.columns]);

  // Column management
  const addColumn = useCallback(() => {
    if (state.columns.length >= 10) return;
    
    // Clone the first column's state as base for new column
    const baseColumn = state.columns[0];
    const newColumn = createDefaultColumnState(uuidv4(), {
      ...baseColumn,
      output: "",
      outputJson: "",
      outputToolCalls: [],
    });
    
    setState(prev => ({
      ...prev,
      columns: [...prev.columns, newColumn],
    }));
  }, [state.columns]);

  const removeColumn = useCallback((columnId: string) => {
    if (state.columns.length <= 1) return;
    
    setState(prev => ({
      ...prev,
      columns: prev.columns.filter(col => col.id !== columnId),
    }));
  }, [state.columns.length]);

  const duplicateColumn = useCallback((columnId: string) => {
    if (state.columns.length >= 10) return;
    
    const columnToDuplicate = state.columns.find(col => col.id === columnId);
    if (!columnToDuplicate) return;
    
    const newColumn = createDefaultColumnState(uuidv4(), {
      ...columnToDuplicate,
      id: uuidv4(),
      messages: columnToDuplicate.messages.map(m => ({ ...m, id: uuidv4() })),
    });
    
    setState(prev => ({
      ...prev,
      columns: [...prev.columns, newColumn],
    }));
  }, [state.columns]);

  // Column state updates with sync logic
  const updateColumnState = useCallback((columnId: string, updates: Partial<PlaygroundColumnState>) => {
    setState(prev => {
      const columnIndex = prev.columns.findIndex(c => c.id === columnId);
      if (columnIndex === -1) return prev;
      
      const updatedColumn = { ...prev.columns[columnIndex], ...updates };
      const newColumns = [...prev.columns];
      newColumns[columnIndex] = updatedColumn;
      
      // Apply sync logic if global sync is enabled
      if (prev.globalSyncEnabled) {
        // Define mapping from state keys to sync flag keys
        const keyToSyncFlag: Record<string, keyof PlaygroundColumnState['syncFlags']> = {
          'messages': 'prompt',
          'modelParams': 'modelParams',
          'tools': 'tools',
          'structuredOutputSchema': 'structuredOutput',
        };
        
        Object.entries(updates).forEach(([key, value]) => {
          const syncKey = keyToSyncFlag[key];
          
          // Check if this property should be synced
          if (syncKey && updatedColumn.syncFlags[syncKey]) {
            // Apply to all other columns that have sync enabled for this property
            newColumns.forEach((col, idx) => {
              if (idx !== columnIndex && col.syncFlags[syncKey]) {
                newColumns[idx] = {
                  ...newColumns[idx],
                  [key]: value,
                };
              }
            });
          }
        });
      }
      
      return { ...prev, columns: newColumns };
    });
  }, []);

  // Sync management
  const toggleColumnSync = useCallback((columnId: string, category: keyof PlaygroundColumnState['syncFlags']) => {
    setState(prev => {
      const columnIndex = prev.columns.findIndex(c => c.id === columnId);
      if (columnIndex === -1) return prev;
      
      const newColumns = [...prev.columns];
      newColumns[columnIndex] = {
        ...newColumns[columnIndex],
        syncFlags: {
          ...newColumns[columnIndex].syncFlags,
          [category]: !newColumns[columnIndex].syncFlags[category],
        },
      };
      
      return { ...prev, columns: newColumns };
    });
  }, []);

  const toggleGlobalSync = useCallback(() => {
    setState(prev => ({
      ...prev,
      globalSyncEnabled: !prev.globalSyncEnabled,
    }));
  }, []);

  // Global state updates
  const updatePromptVariable = useCallback((name: string, value: string) => {
    setState(prev => ({
      ...prev,
      promptVariables: prev.promptVariables.map(v => 
        v.name === name ? { ...v, value } : v
      ),
    }));
  }, []);

  const deletePromptVariable = useCallback((name: string) => {
    setState(prev => ({
      ...prev,
      promptVariables: prev.promptVariables.filter(v => v.name !== name),
    }));
  }, []);

  const updateMessagePlaceholder = useCallback((name: string, value: ChatMessage[]) => {
    setState(prev => ({
      ...prev,
      messagePlaceholders: prev.messagePlaceholders.map(p => 
        p.name === name ? { ...p, value } : p
      ),
    }));
  }, []);

  const deleteMessagePlaceholder = useCallback((name: string) => {
    setState(prev => ({
      ...prev,
      messagePlaceholders: prev.messagePlaceholders.filter(p => p.name !== name),
    }));
  }, []);

  // Execution logic
  const executeColumn = useCallback(async (columnId: string, streaming: boolean = true) => {
    const column = state.columns.find(c => c.id === columnId);
    if (!column) return;
    
    // Mark column as streaming
    updateColumnState(columnId, { 
      isStreaming: true,
      output: "",
      outputJson: "",
      outputToolCalls: [],
    });
    
    try {
      // Compile final messages with variables
      const finalMessages = getFinalMessages(
        state.promptVariables, 
        column.messages, 
        state.messagePlaceholders
      );
      
      const leftOverVariables = extractVariables(
        finalMessages.map((m) => m.content).join("\n"),
      );

      if (!column.modelParams.provider.value || !column.modelParams.model.value) {
        throw new Error("Please select a model");
      }

      if (leftOverVariables.length > 0) {
        throw Error("Error replacing variables. Please check your inputs.");
      }

      if (column.tools.length > 0 && column.structuredOutputSchema) {
        throw new Error(
          "Cannot use both tools and structured output at the same time",
        );
      }

      let response = "";
      let outputToolCalls: LLMToolCall[] = [];
      
      if (column.tools.length > 0) {
        const completion = await getChatCompletionWithTools(
          projectId,
          finalMessages,
          column.modelParams,
          column.tools,
          streaming,
        );

        const displayContent =
          typeof completion.content === "string"
            ? completion.content
            : (completion.content.find(
                (m): m is { type: "text"; text: string } => m.type === "text",
              )?.text as string);

        response = displayContent;
        outputToolCalls = completion.tool_calls;
      } else if (column.structuredOutputSchema) {
        response = await getChatCompletionWithStructuredOutput(
          projectId,
          finalMessages,
          column.modelParams,
          column.structuredOutputSchema,
          streaming,
        );
      } else {
        if (streaming) {
          const completionStream = getChatCompletionStream(
            projectId,
            finalMessages,
            column.modelParams,
          );

          for await (const token of completionStream) {
            response += token;
            // Update output incrementally
            updateColumnState(columnId, { output: response });
          }
        } else {
          response = await getChatCompletionNonStreaming(
            projectId,
            finalMessages,
            column.modelParams,
          );
        }
      }

      const outputJson = getOutputJson(
        response,
        finalMessages,
        column.modelParams,
        column.tools,
        column.structuredOutputSchema,
      );

      updateColumnState(columnId, {
        output: response,
        outputJson,
        outputToolCalls,
        isStreaming: false,
      });
      
      capture("playground:execute_button_click", {
        inputLength: finalMessages.length,
        modelName: column.modelParams.model,
        modelProvider: column.modelParams.provider,
        outputLength: response.length,
        toolCount: column.tools.length,
        isStructuredOutput: Boolean(column.structuredOutputSchema),
        multiColumn: true,
        columnCount: state.columns.length,
      });
    } catch (error) {
      updateColumnState(columnId, {
        output: error instanceof Error ? error.message : "An error occurred",
        isStreaming: false,
      });
    }
  }, [state.columns, state.promptVariables, state.messagePlaceholders, updateColumnState, projectId, capture]);

  const executeAllColumns = useCallback(async () => {
    // Validate all columns have required settings
    const invalidColumns = state.columns.filter(
      col => !col.modelParams.provider.value || !col.modelParams.model.value
    );
    
    if (invalidColumns.length > 0) {
      alert(`Please select a model for all columns before executing.`);
      return;
    }
    
    // Mark all columns as streaming
    state.columns.forEach(col => {
      updateColumnState(col.id, { isStreaming: true });
    });
    
    try {
      // Execute all columns in parallel
      const executions = state.columns.map(column => executeColumn(column.id));
      await Promise.allSettled(executions);
    } catch (error) {
      console.error('Failed to execute columns:', error);
    }
  }, [state.columns, executeColumn, updateColumnState]);

  // Save state to cache
  useEffect(() => {
    const multiCache: MultiPlaygroundCache = {
      columns: state.columns.map(col => ({
        messages: col.messages.map(m => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { id, ...messageWithoutId } = m;
          return messageWithoutId;
        }),
        modelParams: col.modelParams,
        output: col.output,
        tools: col.tools,
        structuredOutputSchema: col.structuredOutputSchema,
        syncFlags: col.syncFlags,
      })),
      promptVariables: state.promptVariables,
      messagePlaceholders: state.messagePlaceholders,
      globalSyncEnabled: state.globalSyncEnabled,
    };
    
    setPlaygroundCache(multiCache as any);
  }, [state, setPlaygroundCache]);

  return (
    <MultiPlaygroundContext.Provider
      value={{
        state,
        addColumn,
        removeColumn,
        duplicateColumn,
        updateColumnState,
        toggleColumnSync,
        toggleGlobalSync,
        updatePromptVariable,
        deletePromptVariable,
        updateMessagePlaceholder,
        deleteMessagePlaceholder,
        executeAllColumns,
        executeColumn,
        availableProviders,
        availableModels,
      }}
    >
      {children}
    </MultiPlaygroundContext.Provider>
  );
};

// Helper functions for API calls
async function getChatCompletionWithTools(
  projectId: string | undefined,
  messages: ChatMessageWithIdNoPlaceholders[],
  modelParams: UIModelParams,
  tools: unknown[],
  streaming: boolean = false,
): Promise<ToolCallResponse> {
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

  return parsed.data;
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

  const body = JSON.stringify({
    projectId,
    messages,
    modelParams: getFinalModelParams(modelParams),
    streaming: true,
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
): Promise<string> {
  if (!projectId) {
    throw new Error("Project ID is not set");
  }

  const body = JSON.stringify({
    projectId,
    messages,
    modelParams: getFinalModelParams(modelParams),
    streaming: false,
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
  return responseData.content || "";
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

  const placeholderValues: MessagePlaceholderValues = messagePlaceholders.reduce(
    (placeholderMap, p) => {
      placeholderMap[p.name] = p.value;
      return placeholderMap;
    },
    {} as MessagePlaceholderValues,
  );

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
  return compiledMessages.filter(
    (m) =>
      m.content.length > 0 || ("toolCalls" in m && m.toolCalls && m.toolCalls.length > 0),
  );
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