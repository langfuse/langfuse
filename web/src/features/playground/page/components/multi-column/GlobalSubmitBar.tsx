import React from "react";
import { Play, Settings } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { Switch } from "@/src/components/ui/switch";
import { cn } from "@/src/utils/tailwind";
import { useMultiPlaygroundContext } from "@/src/features/playground/page/context/multi-playground-context";
import useLocalStorage from "@/src/components/useLocalStorage";
import { env } from "@/src/env.mjs";

interface GlobalSubmitBarProps {
  className?: string;
}

export const GlobalSubmitBar: React.FC<GlobalSubmitBarProps> = ({
  className,
}) => {
  const { handleSubmitAll, isAnyStreaming, columns } = useMultiPlaygroundContext();
  
  const defaultStreamingEnabled =
    env.NEXT_PUBLIC_LANGFUSE_PLAYGROUND_STREAMING_ENABLED_DEFAULT === "true";
  const [streamingEnabled, setStreamingEnabled] = useLocalStorage(
    "langfuse-playground-streaming",
    defaultStreamingEnabled,
  );

  const handleSubmit = async () => {
    await handleSubmitAll(streamingEnabled);
  };

  return (
    <div className={cn(
      "flex items-center justify-between gap-4 p-4 border-t bg-background",
      className
    )}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>{columns.length} column{columns.length !== 1 ? 's' : ''}</span>
        {isAnyStreaming && (
          <span className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            Running...
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 focus:outline-none focus:ring-0 focus-visible:ring-0"
              disabled={isAnyStreaming}
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

        <Button
          onClick={handleSubmit}
          disabled={isAnyStreaming}
          loading={isAnyStreaming}
          className="min-w-[140px]"
        >
          <Play className="mr-2 h-4 w-4" />
          Run All (Ctrl + Enter)
        </Button>
      </div>
    </div>
  );
};