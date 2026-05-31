import React from "react";
import { GitGraph, ChevronRight } from "lucide-react";
import { Badge } from "@/src/components/ui/badge";
import { Skeleton } from "@/src/components/ui/skeleton";
import { cn } from "@/src/utils/tailwind";
import { type LangGraphAssistant } from "../types";

type Props = {
  assistants: LangGraphAssistant[] | undefined;
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (assistant: LangGraphAssistant) => void;
};

export function GraphSelector({ assistants, isLoading, selectedId, onSelect }: Props) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 p-1">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (!assistants || assistants.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
        <GitGraph className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No graphs found on this server
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 p-1">
      {assistants.map((assistant) => (
        <button
          key={assistant.assistant_id}
          onClick={() => onSelect(assistant)}
          className={cn(
            "flex items-center gap-3 rounded-md border px-3 py-2.5 text-left hover:bg-accent",
            selectedId === assistant.assistant_id &&
              "border-primary bg-accent",
          )}
        >
          <GitGraph className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium text-sm">
                {assistant.name || assistant.graph_id}
              </span>
              <Badge variant="secondary" className="text-xs font-mono">
                {assistant.graph_id}
              </Badge>
            </div>
            {assistant.description && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {assistant.description}
              </p>
            )}
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      ))}
    </div>
  );
}
