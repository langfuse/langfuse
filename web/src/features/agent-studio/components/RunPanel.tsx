import React from "react";
import { Square, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Badge } from "@/src/components/ui/badge";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import { type StreamState } from "../types";
import { NodeEventCard } from "./NodeEventCard";

type Props = {
  state: StreamState;
  onCancel: () => void;
  onReset: () => void;
};

export function RunPanel({ state, onCancel, onReset }: Props) {
  const isRunning = state.status === "running";
  const isDone = state.status === "done";
  const isError = state.status === "error";
  const events = state.status !== "idle" ? state.events : [];

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Run Output
        </span>
        {isRunning && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Running…
          </div>
        )}
        {isDone && (
          <div className="flex items-center gap-1 text-xs text-green-600">
            <CheckCircle2 className="h-3 w-3" />
            Done
          </div>
        )}
        {isError && (
          <div className="flex items-center gap-1 text-xs text-destructive">
            <XCircle className="h-3 w-3" />
            Error
          </div>
        )}
        <div className="flex-1" />
        {isRunning && (
          <Button variant="outline" size="sm" onClick={onCancel}>
            <Square className="mr-1 h-3 w-3" />
            Cancel
          </Button>
        )}
        {(isDone || isError) && (
          <Button variant="outline" size="sm" onClick={onReset}>
            Clear
          </Button>
        )}
      </div>

      {isError && "error" in state && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {state.error}
        </div>
      )}

      {state.status !== "idle" && "runId" in state && state.runId && (
        <div className="text-xs text-muted-foreground">
          Run ID:{" "}
          <span className="font-mono">{state.runId}</span>
        </div>
      )}

      {events.length === 0 && state.status === "idle" && (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">
            Configure inputs above and press Run
          </p>
        </div>
      )}

      {events.length === 0 && isRunning && (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Waiting for graph output…
        </div>
      )}

      {events.length > 0 && (
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-2 pr-3">
            {events.map((event) => (
              <NodeEventCard key={event.id} event={event} />
            ))}
            {isRunning && (
              <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Processing…
              </div>
            )}
          </div>
        </ScrollArea>
      )}

      {(isDone || isError) && events.length > 0 && (
        <div className="flex items-center gap-2 border-t pt-2 text-xs text-muted-foreground">
          <Badge variant="outline">{events.length} node{events.length !== 1 ? "s" : ""}</Badge>
          <span>
            {events.filter((e) => e.status === "error").length > 0
              ? `${events.filter((e) => e.status === "error").length} error(s)`
              : "All successful"}
          </span>
        </div>
      )}
    </div>
  );
}
