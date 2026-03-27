import React, { useRef, useState } from "react";
import { MessageSquare, FileText } from "lucide-react";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/src/components/ui/tabs";
import { MetaPromptProvider } from "@/src/features/meta-prompt/context/MetaPromptProvider";
import { ChatPanel } from "./ChatPanel";
import { PromptEditorPanel } from "./PromptEditorPanel";
import type { NewPromptFormHandle } from "@/src/features/prompts/components/NewPromptForm";
import { useModelParams } from "@/src/features/playground/page/hooks/useModelParams";

export const MetaPromptPage: React.FC = () => {
  const promptFormRef = useRef<NewPromptFormHandle | null>(null);
  const [mobileTab, setMobileTab] = useState("chat");

  const {
    modelParams,
    availableProviders,
    availableModels,
    updateModelParamValue,
  } = useModelParams();

  const handleProviderChange = (provider: string) => {
    updateModelParamValue("provider", provider);
  };

  const handleModelChange = (model: string) => {
    updateModelParamValue("model", model);
  };

  return (
    <MetaPromptProvider modelParams={modelParams} promptFormRef={promptFormRef}>
      {/* Desktop: 2-column layout */}
      <div className="hidden h-full lg:flex">
        <div className="flex h-full w-1/2 flex-col border-r">
          <div className="border-b px-3 py-2">
            <h2 className="text-sm font-medium">AI Assistant</h2>
          </div>
          <div className="flex-1 overflow-hidden">
            <ChatPanel
              availableProviders={availableProviders}
              availableModels={availableModels}
              onProviderChange={handleProviderChange}
              onModelChange={handleModelChange}
            />
          </div>
        </div>

        <div className="flex h-full w-1/2 flex-col">
          <div className="border-b px-3 py-2">
            <h2 className="text-sm font-medium">Prompt Editor</h2>
          </div>
          <div className="flex-1 overflow-hidden">
            <PromptEditorPanel promptFormRef={promptFormRef} />
          </div>
        </div>
      </div>

      {/* Mobile: Tab-based layout */}
      <div className="flex h-full flex-col lg:hidden">
        <Tabs
          value={mobileTab}
          onValueChange={setMobileTab}
          className="flex h-full flex-col"
        >
          <TabsList className="mx-2 mt-2 flex w-auto">
            <TabsTrigger value="chat" className="flex-1 gap-1">
              <MessageSquare className="h-4 w-4" />
              AI Assistant
            </TabsTrigger>
            <TabsTrigger value="editor" className="flex-1 gap-1">
              <FileText className="h-4 w-4" />
              Editor
            </TabsTrigger>
          </TabsList>

          <TabsContent value="chat" className="flex-1 overflow-hidden">
            <ChatPanel
              availableProviders={availableProviders}
              availableModels={availableModels}
              onProviderChange={handleProviderChange}
              onModelChange={handleModelChange}
            />
          </TabsContent>

          <TabsContent value="editor" className="flex-1 overflow-hidden">
            <PromptEditorPanel promptFormRef={promptFormRef} />
          </TabsContent>
        </Tabs>
      </div>
    </MetaPromptProvider>
  );
};
