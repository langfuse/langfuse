export type MetaPromptMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
};

export type TargetPlatform = "openai" | "claude" | "gemini" | "generic";

export type MetaPromptContextType = {
  // Chat state
  chatHistory: MetaPromptMessage[];
  sendMessage: (content: string) => Promise<void>;
  isStreaming: boolean;
  stopStreaming: () => void;

  // Model selection
  selectedProvider: string;
  setSelectedProvider: (provider: string) => void;
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  targetPlatform: TargetPlatform;
  setTargetPlatform: (platform: TargetPlatform) => void;

  // Prompt editor integration
  latestImprovedPrompt: string | null;
  applyToEditor: () => void;
};
