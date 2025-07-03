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
  type LLMToolDefinition,
  type LLMToolCall,
  ChatMessageType,
  type ChatMessage,
  compileChatMessagesWithIds,
  type MessagePlaceholderValues,
} from "@langfuse/shared";

import {
  type PlaygroundColumnState,
  type SyncSettings,
  type MultiPlaygroundState,
  type PlaygroundTool,
  type PlaygroundSchema,
  type PlaceholderMessageFillIn,
  type MultiPlaygroundCache,
} from "@/src/features/playground/page/types";
import { getFinalModelParams } from "@/src/utils/getFinalModelParams";
import { env } from "@/src/env.mjs";

interface MultiPlaygroundContextType {
  // Column management
  columns: PlaygroundColumnState[];
  addColumn: () => void;
  removeColumn: (columnId: string) => void;
  
  // Sync management
  syncSettings: SyncSettings;
  toggleSync: (setting: keyof SyncSettings) => void;
  
  // Column-specific operations
  updateColumnState: (columnId: string, updates: Partial<PlaygroundColumnState>) => void;
  updateColumnMessages: (columnId: string, messages: ChatMessageWithId[]) => void;
  updateColumnModelParams: (columnId: string, params: Partial<UIModelParams>) => void;
  updateColumnTools: (columnId: string, tools: PlaygroundTool[]) => void;
  updateColumnSchema: (columnId: string, schema: PlaygroundSchema | null) => void;
  updateColumnMessagePlaceholders: (columnId: string, placeholders: PlaceholderMessageFillIn[]) => void;
  
  // Global operations
  promptVariables: PromptVariable[];
  updatePromptVariableValue: (variable: string, value: string) => void;
  deletePromptVariable: (variable: string) => void;
  
  // Execution
  handleSubmitAll: (streaming?: boolean) => Promise<void>;
  isAnyStreaming: boolean;
  
  // Model params (global)
  availableProviders: ReturnType<typeof useModelParams>['availableProviders'];
  availableModels: ReturnType<typeof useModelParams>['availableModels'];
  
  // Cache management
  setMultiPlaygroundCache: (cache: MultiPlaygroundCache) => void;
}

const MultiPlaygroundContext = createContext<MultiPlaygroundContextType | undefined>(undefined);

export const useMultiPlaygroundContext = () => {
  const context = useContext(MultiPlaygroundContext);
  if (!context) {
    throw new Error(
      "useMultiPlaygroundContext must be used within a MultiPlaygroundProvider",
    );
  }
  return context;
};

// Helper functions copied from the original playground context
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

// Helper function to create a default column
const createDefaultColumn = (modelParams?: UIModelParams): PlaygroundColumnState => ({
  id: uuidv4(),
  messages: [
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
  modelParams: modelParams || {
    provider: { value: "", enabled: true },
    model: { value: "", enabled: true },
    temperature: { value: 1, enabled: true },
    max_tokens: { value: null, enabled: false },
    top_p: { value: 1, enabled: false },
    top_k: { value: null, enabled: false },
    frequency_penalty: { value: 0, enabled: false },
    presence_penalty: { value: 0, enabled: false },
    stop: { value: [], enabled: false },
    seed: { value: null, enabled: false },
  },
  tools: [],
  structuredOutputSchema: null,
  messagePlaceholders: [],
  output: "",
  outputJson: "",
  outputToolCalls: [],
  isStreaming: false,
});

export const MultiPlaygroundProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const capture = usePostHogClientCapture();
  const projectId = useProjectIdFromURL();
  
  // Get model params hook for global model data
  const { availableProviders, availableModels } = useModelParams();
  
  // Multi-playground state
  const [columns, setColumns] = useState<PlaygroundColumnState[]>([]);
  const [syncSettings, setSyncSettings] = useState<SyncSettings>({
    modelParams: true,
    tools: true,
    structuredOutputSchema: true,
    messages: false, // Default to independent messages
  });
  const [promptVariables, setPromptVariables] = useState<PromptVariable[]>([]);

  // Initialize with a single default column
  useEffect(() => {
    if (columns.length === 0) {
      setColumns([createDefaultColumn()]);
    }
  }, [columns.length]);

  // Update prompt variables based on all column messages
  const updatePromptVariables = useCallback(() => {
    const allMessageContents = columns
      .flatMap(column => column.messages)
      .map(m => ('content' in m ? m.content : m.name))
      .join("\n");
    
    const variables = extractVariables(allMessageContents)
      .map(v => v.trim())
      .filter(Boolean);

    setPromptVariables(prev => {
      const next = prev.reduce<PromptVariable[]>((acc, v) => {
        const isUsed = variables.includes(v.name);
        if (!isUsed && !v.value) return acc;
        acc.push({ ...v, isUsed });
        return acc;
      }, []);

      for (const variable of variables) {
        if (!next.some(v => v.name === variable)) {
          next.push({ name: variable, value: "", isUsed: true });
        }
      }

      return next;
    });
  }, [columns]);

  useEffect(updatePromptVariables, [columns, updatePromptVariables]);

  // Sync propagation logic
  const propagateSync = useCallback((
    setting: keyof SyncSettings,
    sourceColumnId: string,
    value: any
  ) => {
    if (!syncSettings[setting]) return;

    setColumns(prev => prev.map(column => {
      if (column.id === sourceColumnId) return column;
      return { ...column, [setting]: value };
    }));
  }, [syncSettings]);

  // Column management
  const addColumn = useCallback(() => {
    if (columns.length >= 10) return; // Max 10 columns
    
    const firstColumn = columns[0];
    const newColumn = createDefaultColumn(firstColumn?.modelParams);
    
    // Copy synced settings from first column
    if (syncSettings.tools && firstColumn) {
      newColumn.tools = [...firstColumn.tools];
    }
    if (syncSettings.structuredOutputSchema && firstColumn) {
      newColumn.structuredOutputSchema = firstColumn.structuredOutputSchema;
    }
    if (syncSettings.messages && firstColumn) {
      newColumn.messages = firstColumn.messages.map(msg => ({ ...msg, id: uuidv4() }));
    }
    
    setColumns(prev => [...prev, newColumn]);
  }, [columns, syncSettings]);

  const removeColumn = useCallback((columnId: string) => {
    if (columns.length <= 1) return; // Keep at least one column
    setColumns(prev => prev.filter(col => col.id !== columnId));
  }, [columns.length]);

  // Sync management
  const toggleSync = useCallback((setting: keyof SyncSettings) => {
    setSyncSettings(prev => {
      const newValue = !prev[setting];
      
      // If enabling sync, propagate first column's value to all others
      if (newValue && columns.length > 1) {
        const firstColumn = columns[0];
        if (firstColumn) {
          setColumns(prevColumns => prevColumns.map((column, index) => {
            if (index === 0) return column;
            return { ...column, [setting]: firstColumn[setting] };
          }));
        }
      }
      
      return { ...prev, [setting]: newValue };
    });
  }, [columns]);

  // Column operations
  const updateColumnState = useCallback((columnId: string, updates: Partial<PlaygroundColumnState>) => {
    setColumns(prev => prev.map(column => {
      if (column.id !== columnId) return column;
      const updated = { ...column, ...updates };
      
      // Propagate synced settings
      Object.keys(updates).forEach(key => {
        if (key in syncSettings && syncSettings[key as keyof SyncSettings]) {
          propagateSync(key as keyof SyncSettings, columnId, updates[key as keyof PlaygroundColumnState]);
        }
      });
      
      return updated;
    }));
  }, [propagateSync, syncSettings]);

  const updateColumnMessages = useCallback((columnId: string, messages: ChatMessageWithId[]) => {
    updateColumnState(columnId, { messages });
  }, [updateColumnState]);

  const updateColumnModelParams = useCallback((columnId: string, params: Partial<UIModelParams>) => {
    const sourceColumn = columns.find(c => c.id === columnId);
    if (!sourceColumn) return;
    
    const updatedParams = { ...sourceColumn.modelParams, ...params };
    updateColumnState(columnId, { modelParams: updatedParams });
  }, [columns, updateColumnState]);

  const updateColumnTools = useCallback((columnId: string, tools: PlaygroundTool[]) => {
    updateColumnState(columnId, { tools });
  }, [updateColumnState]);

  const updateColumnSchema = useCallback((columnId: string, schema: PlaygroundSchema | null) => {
    updateColumnState(columnId, { structuredOutputSchema: schema });
  }, [updateColumnState]);

  const updateColumnMessagePlaceholders = useCallback((columnId: string, placeholders: PlaceholderMessageFillIn[]) => {
    updateColumnState(columnId, { messagePlaceholders: placeholders });
  }, [updateColumnState]);

  // Global prompt variables
  const updatePromptVariableValue = useCallback((variable: string, value: string) => {
    setPromptVariables(prev =>
      prev.map(v => (v.name === variable ? { ...v, value } : v))
    );
  }, []);

  const deletePromptVariable = useCallback((variable: string) => {
    setPromptVariables(prev => prev.filter(v => v.name !== variable));
  }, []);

  // Execution logic
  const handleSubmitAll = useCallback(async (streaming = true) => {
    try {
      // Set all columns to streaming
      setColumns(prev => prev.map(col => ({ ...col, isStreaming: true, output: "", outputJson: "", outputToolCalls: [] })));

      // Execute all columns in parallel
      const executionPromises = columns.map(async (column) => {
        try {
          const finalMessages = getFinalMessages(promptVariables, column.messages, column.messagePlaceholders);
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
                // Update column output in real-time during streaming
                setColumns(prev => prev.map(col => 
                  col.id === column.id 
                    ? { ...col, output: response }
                    : col
                ));
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

          // Update column with final result
          setColumns(prev => prev.map(col => 
            col.id === column.id 
              ? { 
                  ...col, 
                  output: response, 
                  outputJson,
                  outputToolCalls,
                  isStreaming: false 
                }
              : col
          ));

          // Track analytics for this column
          capture("playground:execute_button_click", {
            inputLength: finalMessages.length,
            modelName: column.modelParams.model,
            modelProvider: column.modelParams.provider,
            outputLength: response.length,
            toolCount: column.tools.length,
            isStructuredOutput: Boolean(column.structuredOutputSchema),
            isMultiColumn: true,
            totalColumns: columns.length,
          });

        } catch (error) {
          // Handle individual column errors
          setColumns(prev => prev.map(col => 
            col.id === column.id 
              ? { 
                  ...col, 
                  output: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`, 
                  isStreaming: false 
                }
              : col
          ));
        }
      });

      await Promise.allSettled(executionPromises);

    } catch (error) {
      console.error('Error in handleSubmitAll:', error);
      // Reset streaming state on global error
      setColumns(prev => prev.map(col => ({ ...col, isStreaming: false })));
    }
  }, [columns, promptVariables, projectId, capture]);

  const isAnyStreaming = columns.some(col => col.isStreaming);

  // Cache management (placeholder)
  const setMultiPlaygroundCache = useCallback((cache: MultiPlaygroundCache) => {
    // TODO: Implement cache management
    console.log('Setting multi-playground cache:', cache);
  }, []);

  return (
    <MultiPlaygroundContext.Provider
      value={{
        columns,
        addColumn,
        removeColumn,
        syncSettings,
        toggleSync,
        updateColumnState,
        updateColumnMessages,
        updateColumnModelParams,
        updateColumnTools,
        updateColumnSchema,
        updateColumnMessagePlaceholders,
        promptVariables,
        updatePromptVariableValue,
        deletePromptVariable,
        handleSubmitAll,
        isAnyStreaming,
        availableProviders,
        availableModels,
        setMultiPlaygroundCache,
      }}
    >
      {children}
    </MultiPlaygroundContext.Provider>
  );
};