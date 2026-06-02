import React, { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { Badge } from "@/src/components/ui/badge";
import { cn } from "@/src/utils/tailwind";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { type NodeEvent } from "../types";

type Props = {
  event: NodeEvent;
};

export function NodeEventCard({ event }: Props) {
  const [open, setOpen] = useState(false);

  const statusIcon =
    event.status === "running" ? (
      <Loader2 className="text-muted-foreground h-3.5 w-3.5 animate-spin" />
    ) : event.status === "error" ? (
      <XCircle className="text-destructive h-3.5 w-3.5" />
    ) : (
      <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
    );

  return (
    <div
      className={cn(
        "bg-card rounded-md border",
        event.status === "error" && "border-destructive/50",
      )}
    >
      <button
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <ChevronDown className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronRight className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
        )}
        {statusIcon}
        <span className="flex-1 truncate font-mono text-sm font-medium">
          {event.nodeName === "__state__" ? "Final State" : event.nodeName}
        </span>
        {event.durationMs !== undefined && event.status !== "running" && (
          <span className="text-muted-foreground text-xs">
            {event.durationMs < 1000
              ? `${event.durationMs}ms`
              : `${(event.durationMs / 1000).toFixed(1)}s`}
          </span>
        )}
        <Badge
          variant={
            event.status === "error"
              ? "destructive"
              : event.status === "running"
                ? "secondary"
                : "outline"
          }
          className="text-xs"
        >
          {event.status}
        </Badge>
      </button>
      {open && (
        <div className="border-t px-3 pt-2 pb-3">
          <PrettyJsonView json={event.data} />
        </div>
      )}
    </div>
  );
}
