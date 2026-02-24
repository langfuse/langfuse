import { Button } from "@/src/components/ui/button";
import { usePlaygroundContext } from "@/src/features/playground/page/context";
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

import { GenerationOutput } from "./GenerationOutput";
import { ChatMessages } from "@/src/components/ChatMessages";
import { type MessagesContext } from "@/src/components/ChatMessages/types";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/src/components/ui/resizable";

export const Messages: React.FC<MessagesContext> = (props) => {
  return (
    <div className="flex h-full flex-col space-y-4 pr-4 pt-2">
      <ResizablePanelGroup orientation="vertical">
        <ResizablePanel minSize="10%">
          <ChatMessages {...props} />
        </ResizablePanel>
        <ResizableHandle withHandle className="bg-transparent" />
        <ResizablePanel
          minSize="20%"
          defaultSize="20%"
          className="flex flex-col space-y-4"
        >
          <GenerationOutput />
        </ResizablePanel>
      </ResizablePanelGroup>
      <SubmitButton />
    </div>
  );
};

const SubmitButton = () => {
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
          handleSubmit(streamingEnabled).catch((err) => console.error(err));
        }}
        loading={isStreaming}
      >
        <p>Submit</p>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 focus:outline-none focus:ring-0 focus-visible:ring-0"
            disabled={isStreaming}
          >
            <Settings className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem
            className="flex cursor-pointer items-center justify-between py-2.5"
            onClick={(e) => e.preventDefault()}
          >
            <div className="flex flex-col">
              <span className="font-medium">Stream responses</span>
              <span className="text-xs text-muted-foreground">
                {streamingEnabled
                  ? "Real-time response streaming"
                  : "Complete response at once"}
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
