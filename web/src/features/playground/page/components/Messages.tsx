import { Button } from "@/src/components/ui/button";
import { usePlaygroundContext } from "@/src/features/playground/page/context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import { Settings } from "lucide-react";
import useLocalStorage from "@/src/components/useLocalStorage";
import { env } from "@/src/env.mjs";
import { STREAMING_PREF_KEY } from "@/src/features/playground/page/storage/keys";
import { captureUnknownError } from "@/src/utils/captureUnknownError";

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
    <div className="flex h-full flex-col space-y-4 pt-2 pr-4">
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

const REPETITION_OPTIONS = [1, 3, 5, 10];

const SubmitButton = () => {
  const { handleSubmit, isStreaming, runCount, setRunCount } =
    usePlaygroundContext();
  const defaultStreamingEnabled =
    env.NEXT_PUBLIC_LANGFUSE_PLAYGROUND_STREAMING_ENABLED_DEFAULT === "true";
  const [streamingEnabled, setStreamingEnabled] = useLocalStorage(
    STREAMING_PREF_KEY,
    defaultStreamingEnabled,
  );

  return (
    <div className="flex items-center gap-2">
      <Button
        className="flex-1"
        onClick={() => {
          handleSubmit(streamingEnabled).catch((err) =>
            captureUnknownError("playground.run", err),
          );
        }}
        loading={isStreaming}
      >
        <p>{runCount > 1 ? `Submit \u00d7${runCount}` : "Submit"}</p>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 focus:ring-0 focus:outline-hidden focus-visible:ring-0"
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
              <span className="font-bold">Stream responses</span>
              <span className="text-muted-foreground text-xs">
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
          <DropdownMenuItem
            className="flex cursor-pointer items-center justify-between py-2.5"
            onClick={(e) => e.preventDefault()}
          >
            <div className="flex flex-col">
              <span className="font-bold">Repetitions</span>
              <span className="text-muted-foreground text-xs">
                {runCount > 1
                  ? `Run ${runCount}\u00d7 to compare consistency`
                  : "Run the same setup multiple times"}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {REPETITION_OPTIONS.map((option) => (
                <Button
                  key={option}
                  size="sm"
                  variant={runCount === option ? "default" : "outline"}
                  className="h-6 px-2 text-xs"
                  onClick={() => setRunCount(option)}
                >
                  {option}
                </Button>
              ))}
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
