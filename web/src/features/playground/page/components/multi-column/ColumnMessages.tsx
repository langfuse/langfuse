import React from "react";
import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { Switch } from "@/src/components/ui/switch";
import { Settings } from "lucide-react";
import useLocalStorage from "@/src/components/useLocalStorage";
import { env } from "@/src/env.mjs";

import { GenerationOutput } from "../GenerationOutput";
import { ChatMessages } from "@/src/components/ChatMessages";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/src/components/ui/resizable";
import { usePlaygroundContext } from "./PlaygroundColumnProvider";

export const ColumnMessages: React.FC = () => {
  const playgroundContext = usePlaygroundContext();

  return (
    <div className="flex h-full flex-col space-y-4">
      <ResizablePanelGroup direction="vertical">
        <ResizablePanel minSize={10}>
          <ChatMessages {...playgroundContext} />
        </ResizablePanel>
        <ResizableHandle withHandle className="bg-transparent" />
        <ResizablePanel
          minSize={10}
          defaultSize={20}
          className="flex flex-col space-y-4"
        >
          <GenerationOutput />
        </ResizablePanel>
      </ResizablePanelGroup>
      <ColumnSubmitButton />
    </div>
  );
};

const ColumnSubmitButton = () => {
  const { handleSubmit, isStreaming } = usePlaygroundContext();
  const defaultStreamingEnabled =
    env.NEXT_PUBLIC_LANGFUSE_PLAYGROUND_STREAMING_ENABLED_DEFAULT === "true";
  const [streamingEnabled, setStreamingEnabled] = useLocalStorage(
    "langfuse-playground-streaming",
    defaultStreamingEnabled,
  );

  return (
    <div className="flex items-center gap-2">
      <Button
        className="flex-1"
        onClick={() => {
          handleSubmit(streamingEnabled).catch((err: unknown) => console.error(err));
        }}
        loading={isStreaming}
        size="sm"
      >
        <p className="text-xs">Submit</p>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 focus:outline-none focus:ring-0 focus-visible:ring-0"
            disabled={isStreaming}
          >
            <Settings className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem
            className="flex cursor-pointer items-center justify-between py-2.5"
            onClick={(e) => e.preventDefault()}
          >
            <div className="flex flex-col">
              <span className="font-medium text-xs">Stream responses</span>
              <span className="text-xs text-muted-foreground">
                {streamingEnabled
                  ? "Real-time streaming"
                  : "Complete at once"}
              </span>
            </div>
            <Switch
              checked={streamingEnabled}
              onCheckedChange={setStreamingEnabled}
            />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};