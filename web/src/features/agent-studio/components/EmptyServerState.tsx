import React from "react";
import { Workflow } from "lucide-react";
import { Button } from "@/src/components/ui/button";

type Props = {
  onAddServer: () => void;
};

export function EmptyServerState({ onAddServer }: Props) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-24">
      <div className="bg-muted flex h-16 w-16 items-center justify-center rounded-full">
        <Workflow className="text-muted-foreground h-8 w-8" />
      </div>
      <div className="text-center">
        <h3 className="text-lg font-semibold">No LangGraph server connected</h3>
        <p className="text-muted-foreground mt-1 max-w-sm text-sm">
          Connect a LangGraph server to run and debug your agents interactively
          from within Langfuse.
        </p>
      </div>
      <Button onClick={onAddServer}>Add Server</Button>
    </div>
  );
}
