import React from "react";

import { useMetaPromptContext } from "@/src/features/meta-prompt/context/MetaPromptProvider";
import { ModelSelector } from "./ModelSelector";
import { ChatHistory } from "./ChatHistory";
import { ChatInput } from "./ChatInput";

type ChatPanelProps = {
  availableProviders: string[];
  availableModels: string[];
  onProviderChange: (provider: string) => void;
  onModelChange: (model: string) => void;
};

export const ChatPanel: React.FC<ChatPanelProps> = ({
  availableProviders,
  availableModels,
  onProviderChange,
  onModelChange,
}) => {
  const {
    chatHistory,
    sendMessage,
    isStreaming,
    stopStreaming,
    selectedProvider,
    selectedModel,
    targetPlatform,
    setTargetPlatform,
  } = useMetaPromptContext();

  const hasModel = Boolean(selectedProvider && selectedModel);

  return (
    <div className="flex h-full flex-col">
      <ModelSelector
        availableProviders={availableProviders}
        availableModels={availableModels}
        selectedProvider={selectedProvider}
        selectedModel={selectedModel}
        targetPlatform={targetPlatform}
        onProviderChange={onProviderChange}
        onModelChange={onModelChange}
        onTargetPlatformChange={setTargetPlatform}
      />

      <ChatHistory chatHistory={chatHistory} isStreaming={isStreaming} />

      <ChatInput
        onSend={(content) => void sendMessage(content)}
        onStop={stopStreaming}
        isStreaming={isStreaming}
        disabled={!hasModel}
      />
    </div>
  );
};
