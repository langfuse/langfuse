import {
  type ChatMessage,
  type LLMJSONSchema,
  type LlmSchema,
  type LlmTool,
  type LLMToolDefinition,
  type PlaceholderMessage,
  type PromptVariable,
  type UIModelParams,
} from "@langfuse/shared";

export type PlaygroundTool = LLMToolDefinition & {
  id: string;
  existingLlmTool?: LlmTool;
};

export type PlaygroundSchema = {
  id: string;
  name: string;
  description: string;
  schema: LLMJSONSchema;
  existingLlmSchema?: LlmSchema;
};

export type PlaceholderMessageFillIn = {
  name: string;
  value: ChatMessage[];
  isUsed: boolean;
};

export type PlaygroundCache = {
  messages: (ChatMessage | PlaceholderMessage)[];
  modelParams?: Partial<UIModelParams> &
    Pick<UIModelParams, "provider" | "model">;
  output?: string | null;
  promptVariables?: PromptVariable[];
  messagePlaceholders?: PlaceholderMessageFillIn[];
  tools?: PlaygroundTool[];
  structuredOutputSchema?: PlaygroundSchema | null;
} | null;

// Multi-window types and interfaces

/**
 * Handle interface for coordinating actions with individual playground windows
 * Used by the global coordination system to execute actions on specific windows
 */
export interface PlaygroundHandle {
  /** Execute the playground with optional streaming */
  handleSubmit: (streaming?: boolean) => Promise<void>;
  /** Stop the current execution */
  stopExecution: () => void;
  /** Getter for current streaming state */
  getIsStreaming: () => boolean;
  /** Getter for whether a model is configured */
  hasModelConfigured: () => boolean;
}

/**
 * Return type for the useWindowCoordination hook
 * Provides functions for managing the global window coordination system
 */
export interface WindowCoordinationReturn {
  /** Register a window with the global coordination system */
  registerWindow: (windowId: string, handle: PlaygroundHandle) => void;
  /** Unregister a window from the global coordination system */
  unregisterWindow: (windowId: string) => void;
  /** Execute all registered windows in parallel */
  executeAllWindows: () => void;
  /** Stop all currently executing windows */
  stopAllWindows: () => void;
  /** Get current execution status across all windows */
  getExecutionStatus: () => string | null;
  /** Whether any windows are currently executing */
  isExecutingAll: boolean;
  /** Whether any window has a model configured */
  hasAnyModelConfigured: boolean;
}

/**
 * Props for PlaygroundProvider with multi-window support
 * Extends the existing provider to support window-specific state isolation
 */
export interface PlaygroundProviderProps {
  children: React.ReactNode;
  /** Optional window ID for state isolation. Defaults to "default" for single-window mode */
  windowId?: string;
}

/**
 * State management for the multi-window playground container
 * Tracks all active windows and global execution state
 */
export interface MultiWindowState {
  /** Array of window IDs currently active */
  windowIds: string[];
  /** Whether a global "execute all" operation is in progress */
  isExecutingAll: boolean;
}

/**
 * Event types for the global coordination system
 * Custom events dispatched through the EventTarget-based event bus
 */
export const PLAYGROUND_EVENTS = {
  EXECUTE_ALL: "playground:execute-all",
  STOP_ALL: "playground:stop-all",
  WINDOW_REGISTERED: "playground:window-registered",
  WINDOW_UNREGISTERED: "playground:window-unregistered",
  WINDOW_EXECUTION_STATE_CHANGE: "playground:window-execution-state-change",
  WINDOW_MODEL_CONFIG_CHANGE: "playground:window-model-config-change",
} as const;

/**
 * Configuration for window limits and validation
 * Defines constraints for multi-window functionality
 */
export const MULTI_WINDOW_CONFIG = {
  /** Maximum number of windows allowed */
  MAX_WINDOWS: 10,
  /** Maximum number of windows allowed on mobile/small screens */
  MAX_WINDOWS_MOBILE: 1,
  /** Minimum window width in pixels */
  MIN_WINDOW_WIDTH: 400,
  /** Mobile breakpoint in pixels (below this, mobile behavior applies) */
  MOBILE_BREAKPOINT: 768,
  /** Default window ID for single-window mode */
  DEFAULT_WINDOW_ID: "default",
} as const;
