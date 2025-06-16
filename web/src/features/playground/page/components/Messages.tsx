import { Button } from "@/src/components/ui/button";
import { usePlaygroundContext } from "@/src/features/playground/page/context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { Switch } from "@/src/components/ui/switch";
import { ChevronDown } from "lucide-react";
import useLocalStorage from "@/src/components/useLocalStorage";

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
      <ResizablePanelGroup direction="vertical">
        <ResizablePanel minSize={10}>
          <ChatMessages {...props} />
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
      <SubmitButton />
    </div>
  );
};

const SubmitButton = () => {
  const { handleSubmit, isStreaming } = usePlaygroundContext();
  const [streamingEnabled, setStreamingEnabled] = useLocalStorage(
    "langfuse-playground-streaming",
    true,
  );

  return (
    <div className="flex items-center">
      <Button
        className="flex-1 rounded-r-none border-r-0"
        onClick={() => {
          handleSubmit(streamingEnabled).catch((err) => console.error(err));
        }}
        loading={isStreaming}
      >
        <p>Submit (Ctrl + Enter)</p>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="default"
            size="sm"
            className="h-8 rounded-l-none border-l border-primary-foreground/20 bg-primary px-2 py-1 hover:bg-primary/90"
            disabled={isStreaming}
            tabIndex={-1}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem
            className="flex cursor-pointer items-center justify-between py-2.5"
            onClick={(e) => e.preventDefault()}
          >
            <div className="flex flex-col">
              <span className="font-medium">Stream responses</span>
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
