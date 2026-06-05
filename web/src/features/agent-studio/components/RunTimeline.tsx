import React, { useState } from "react";
import { ChevronDown, ChevronRight, Loader2, User } from "lucide-react";
import { Badge } from "@/src/components/ui/badge";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { type NodeEvent, type StreamState } from "../types";

function timeAgo(ts: number): string {
  const diff = Math.round((Date.now() - ts) / 1000);
  if (diff < 3) return "just now";
  if (diff < 60) return `${diff}s ago`;
  const mins = Math.round(diff / 60);
  return `${mins}m ago`;
}

const NODE_COLORS = [
  "bg-blue-500",
  "bg-green-600",
  "bg-purple-500",
  "bg-orange-500",
  "bg-pink-500",
  "bg-teal-500",
  "bg-indigo-500",
  "bg-rose-500",
];

function nodeColor(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % NODE_COLORS.length;
  return NODE_COLORS[h] ?? "bg-gray-500";
}

function NodeAvatar({ nodeName }: { nodeName: string }) {
  if (nodeName === "__start__") {
    return (
      <div className="bg-muted flex h-6 w-6 shrink-0 items-center justify-center rounded-full border">
        <User className="text-muted-foreground h-3 w-3" />
      </div>
    );
  }
  return (
    <div
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${nodeColor(nodeName)} text-xs font-bold text-white`}
    >
      {nodeName.charAt(0).toUpperCase()}
    </div>
  );
}

function parseInput(values: Record<string, string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (!v && v !== "0") continue;
    if ((v.startsWith("[") || v.startsWith("{")) && v.length > 1) {
      try {
        result[k] = JSON.parse(v);
        continue;
      } catch {
        /* */
      }
    }
    result[k] = v;
  }
  return result;
}

// Strip subgraph namespace prefix: "subgraph_name:node_name" → "node_name"
function displayName(nodeName: string): string {
  const idx = nodeName.lastIndexOf(":");
  return idx >= 0 ? nodeName.slice(idx + 1) : nodeName;
}

function hasData(data: unknown): boolean {
  if (data == null) return false;
  if (
    typeof data === "object" &&
    !Array.isArray(data) &&
    Object.keys(data as object).length === 0
  )
    return false;
  return true;
}

function EventRow({
  event,
  isActive,
  indent = false,
}: {
  event: NodeEvent;
  isActive: boolean;
  indent?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const name = displayName(event.nodeName);
  const expandable = hasData(event.data);

  return (
    <div>
      <button
        className={`flex w-full items-center gap-2 py-1.5 text-left ${expandable ? "hover:bg-muted/40" : "cursor-default"} ${indent ? "pr-3 pl-8" : "px-3"}`}
        onClick={() => expandable && setOpen((v) => !v)}
      >
        {expandable ? (
          open ? (
            <ChevronDown className="text-muted-foreground h-3 w-3 shrink-0" />
          ) : (
            <ChevronRight className="text-muted-foreground h-3 w-3 shrink-0" />
          )
        ) : (
          <span className="h-3 w-3 shrink-0" />
        )}
        <NodeAvatar nodeName={name} />
        <span
          className={`flex-1 truncate text-sm font-medium ${isActive ? "text-primary" : ""}`}
        >
          {name}
        </span>
        {!expandable && !isActive && (
          <span className="text-muted-foreground shrink-0 text-xs">—</span>
        )}
        {isActive && (
          <Loader2 className="text-primary h-3 w-3 shrink-0 animate-spin" />
        )}
        {!isActive && event.durationMs != null && event.durationMs > 0 && (
          <span className="text-muted-foreground shrink-0 text-xs">
            {event.durationMs < 1000
              ? `${event.durationMs}ms`
              : `${(event.durationMs / 1000).toFixed(2)}s`}
          </span>
        )}
        <span className="text-muted-foreground shrink-0 text-xs">
          {timeAgo(event.receivedAt)}
        </span>
      </button>
      {open && expandable && (
        <div
          className={`bg-muted/20 mb-1.5 rounded-md border px-2 py-1.5 ${indent ? "mr-3 ml-12" : "mr-3 ml-8"}`}
        >
          <PrettyJsonView json={event.data} collapseStringsAfterLength={60} />
        </div>
      )}
    </div>
  );
}

// Collapsible group for parallel subgraph instances (e.g., my_subgraph #1, #2, …)
function SubgraphGroup({
  parentName,
  instanceNum,
  events,
  isActive,
  startedAt,
}: {
  parentName: string;
  instanceNum: number;
  events: NodeEvent[];
  isActive: boolean;
  startedAt: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-muted ml-3 border-l-2">
      <button
        className="hover:bg-muted/40 flex w-full items-center gap-2 px-3 py-1.5 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <ChevronDown className="text-muted-foreground h-3 w-3 shrink-0" />
        ) : (
          <ChevronRight className="text-muted-foreground h-3 w-3 shrink-0" />
        )}
        <NodeAvatar nodeName={parentName} />
        <span
          className={`flex-1 truncate text-sm font-medium ${isActive ? "text-primary" : ""}`}
        >
          {parentName}
          <span className="text-muted-foreground ml-1 text-xs font-normal">
            #{instanceNum}
          </span>
        </span>
        {isActive && (
          <Loader2 className="text-primary h-3 w-3 shrink-0 animate-spin" />
        )}
        {!isActive && (
          <span className="text-muted-foreground shrink-0 text-xs">
            {events.length} step{events.length !== 1 ? "s" : ""}
          </span>
        )}
        <span className="text-muted-foreground shrink-0 text-xs">
          {timeAgo(startedAt)}
        </span>
      </button>
      {open && (
        <div className="flex flex-col">
          {events.map((ev, idx) => (
            <EventRow
              key={ev.id}
              event={ev}
              isActive={isActive && idx === events.length - 1}
              indent
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Display model ──────────────────────────────────────────────────────────

type DisplayItem =
  | { kind: "event"; event: NodeEvent }
  | {
      kind: "group";
      ns: string;
      parentName: string;
      instanceNum: number;
      events: NodeEvent[];
      startedAt: number;
    };

function buildDisplayItems(nodeEvents: NodeEvent[]): DisplayItem[] {
  const items: DisplayItem[] = [];
  const nsToGroup = new Map<string, DisplayItem & { kind: "group" }>();

  // Collect all subgraph parent names so we can suppress their outer events
  const subgraphParents = new Set(
    nodeEvents
      .filter((e) => e.subgraphNs)
      .map((e) => e.subgraphNs!.split(":")[0] ?? ""),
  );

  let nsCounter = 0;

  for (const event of nodeEvents) {
    if (event.subgraphNs) {
      if (!nsToGroup.has(event.subgraphNs)) {
        nsCounter++;
        const parentName = event.subgraphNs.split(":")[0] ?? event.subgraphNs;
        const group: DisplayItem & { kind: "group" } = {
          kind: "group",
          ns: event.subgraphNs,
          parentName,
          instanceNum: nsCounter,
          events: [],
          startedAt: event.receivedAt,
        };
        nsToGroup.set(event.subgraphNs, group);
        items.push(group);
      }
      nsToGroup.get(event.subgraphNs)!.events.push(event);
    } else if (!subgraphParents.has(event.nodeName)) {
      // Suppress outer graph events that are just the subgraph's completion echo
      items.push({ kind: "event", event });
    }
  }

  return items;
}

// ─── Main component ──────────────────────────────────────────────────────────

type Props = {
  streamState: StreamState;
  inputValues: Record<string, string>;
  runStartedAt: number | null;
};

export function RunTimeline({ streamState, inputValues, runStartedAt }: Props) {
  const [inputOpen, setInputOpen] = useState(false);
  const [turnOpen, setTurnOpen] = useState(true);

  if (streamState.status === "idle") {
    return (
      <div className="text-muted-foreground flex items-center justify-center px-4 py-10 text-center text-xs">
        Run an agent to see execution steps here
      </div>
    );
  }

  const allEvents = "events" in streamState ? streamState.events : [];
  const nodeEvents = allEvents.filter(
    (e) => e.type === "updates" && e.nodeName !== "__state__",
  );
  const isRunning = streamState.status === "running";
  const hasError = streamState.status === "error";
  const displayItems = buildDisplayItems(nodeEvents);

  return (
    <div className="flex flex-col">
      {/* TURN 1 header */}
      <button
        className="hover:bg-muted/40 flex items-center gap-2 border-b px-3 py-2 text-left"
        onClick={() => setTurnOpen((v) => !v)}
      >
        <ChevronDown
          className={`text-muted-foreground h-3.5 w-3.5 shrink-0 transition-transform ${turnOpen ? "" : "-rotate-90"}`}
        />
        <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
          Turn 1
        </span>
        <div className="ml-auto flex items-center">
          {isRunning && (
            <Loader2 className="text-primary h-3.5 w-3.5 animate-spin" />
          )}
          {!isRunning && !hasError && (
            <Badge
              variant="outline"
              className="border-green-600 px-1.5 py-0 text-xs text-green-600"
            >
              Done
            </Badge>
          )}
          {hasError && (
            <Badge variant="destructive" className="px-1.5 py-0 text-xs">
              Error
            </Badge>
          )}
        </div>
      </button>

      {turnOpen && (
        <div className="flex flex-col">
          {runStartedAt && (
            <div className="text-muted-foreground px-3 pt-2 text-xs">
              {timeAgo(runStartedAt)}
            </div>
          )}

          {/* __start__ input row */}
          <button
            className="hover:bg-muted/40 flex w-full items-center gap-2 px-3 py-1.5 text-left"
            onClick={() => setInputOpen((v) => !v)}
          >
            {inputOpen ? (
              <ChevronDown className="text-muted-foreground h-3 w-3 shrink-0" />
            ) : (
              <ChevronRight className="text-muted-foreground h-3 w-3 shrink-0" />
            )}
            <NodeAvatar nodeName="__start__" />
            <span className="flex-1 text-sm font-medium">__start__</span>
            {runStartedAt && (
              <span className="text-muted-foreground shrink-0 text-xs">
                {timeAgo(runStartedAt)}
              </span>
            )}
          </button>
          {inputOpen && (
            <div className="bg-muted/20 mr-3 mb-1.5 ml-8 rounded-md border px-2 py-1.5">
              <PrettyJsonView
                json={parseInput(inputValues)}
                collapseStringsAfterLength={60}
              />
            </div>
          )}

          {/* Node events — flat or grouped */}
          {displayItems.map((item, idx) => {
            const isLastItem = idx === displayItems.length - 1;
            if (item.kind === "event") {
              return (
                <EventRow
                  key={item.event.id}
                  event={item.event}
                  isActive={isRunning && isLastItem}
                />
              );
            }
            return (
              <SubgraphGroup
                key={item.ns}
                parentName={item.parentName}
                instanceNum={item.instanceNum}
                events={item.events}
                isActive={isRunning && isLastItem}
                startedAt={item.startedAt}
              />
            );
          })}

          {/* Error message */}
          {hasError && "error" in streamState && (
            <div className="border-destructive/50 bg-destructive/10 text-destructive mx-3 my-2 rounded-md border px-3 py-2 text-xs">
              {streamState.error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
