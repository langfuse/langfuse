import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Play,
  Square,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  Plus,
  GitGraph,
  ChevronRight,
  Settings,
} from "lucide-react";
import { Button } from "@/src/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/src/components/ui/resizable";
import { Separator } from "@/src/components/ui/separator";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import { Badge } from "@/src/components/ui/badge";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { TracePage } from "@/src/components/trace/TracePage";
import Page from "@/src/components/layouts/page";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { api } from "@/src/utils/api";
import {
  type LangGraphAssistant,
  type LangGraphThread,
  type AgentStudioServerRecord,
  type LangGraphGraphDef,
  type NodeEvent,
  type StreamState,
} from "./types";
import { EmptyServerState } from "./components/EmptyServerState";
import { InputForm } from "./components/InputForm";
import { ServerConfigSheet } from "./components/ServerConfigSheet";
import { GraphView } from "./components/GraphView";
import { RunTimeline } from "./components/RunTimeline";
import { useLangGraphApi } from "./hooks/useLangGraphApi";
import { useAgentStream } from "./hooks/useAgentStream";

// Convert string-based form values to proper types before sending
function prepareInput(values: Record<string, string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (!v && v !== "0") continue;
    if ((v.startsWith("[") || v.startsWith("{")) && v.length > 1) {
      try {
        result[k] = JSON.parse(v);
        continue;
      } catch {
        /* fall through */
      }
    }
    result[k] = v;
  }
  return result;
}

const THREAD_STATUS_VARIANT: Record<
  string,
  "outline" | "secondary" | "destructive"
> = {
  idle: "outline",
  busy: "secondary",
  error: "destructive",
  interrupted: "secondary",
};

type TraceSummary = { id: string; name: string; timestamp: string };

// Trace panel — shows all Langfuse traces created since the given timestamp
function TracePanel({
  startedAt,
  projectId,
}: {
  startedAt: number | null;
  projectId: string;
}) {
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const enabled = startedAt != null;

  const prevStartedAt = useRef<number | null>(null);
  if (prevStartedAt.current !== startedAt) {
    prevStartedAt.current = startedAt;
    if (selectedTraceId !== null) setSelectedTraceId(null);
  }

  const query = (api.traces.all as any).useQuery(
    {
      projectId,
      filter: enabled
        ? [
            {
              type: "datetime",
              column: "timestamp",
              operator: ">=",
              value: new Date(startedAt! - 10_000),
            },
          ]
        : null,
      searchQuery: null,
      searchType: ["id"],
      orderBy: null,
      limit: 50,
      page: 0,
    },
    { enabled, refetchInterval: 3_000 },
  );

  const traces =
    (query.data as { traces?: TraceSummary[] } | undefined)?.traces ?? [];

  if (!enabled) {
    return (
      <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 px-4 py-10 text-center text-xs">
        <GitGraph className="h-8 w-8 opacity-30" />
        Run an agent to see the full Langfuse trace here
      </div>
    );
  }

  if (selectedTraceId) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <button
          className="text-muted-foreground hover:bg-muted/40 hover:text-foreground flex shrink-0 items-center gap-1.5 border-b px-3 py-2 text-xs"
          onClick={() => setSelectedTraceId(null)}
        >
          <ChevronRight className="h-3 w-3 rotate-180" />
          Back to traces
        </button>
        <div className="min-h-0 flex-1 overflow-auto">
          <TracePage traceId={selectedTraceId} />
        </div>
      </div>
    );
  }

  if (traces.length === 0) {
    return (
      <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 px-4 py-10 text-center text-xs">
        <Loader2 className="h-6 w-6 animate-spin opacity-40" />
        Waiting for Langfuse traces…
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {traces.map((trace) => (
        <button
          key={trace.id}
          className="hover:bg-muted/40 flex w-full items-center gap-2 border-b px-3 py-2 text-left"
          onClick={() => setSelectedTraceId(trace.id)}
        >
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-sm font-medium">{trace.name}</span>
            <span className="text-muted-foreground text-xs">
              {new Date(trace.timestamp).toLocaleTimeString()}
            </span>
          </div>
          <ChevronRight className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
        </button>
      ))}
    </div>
  );
}

export default function AgentStudioPage() {
  const projectId = useProjectIdFromURL() ?? "";

  const [selectedServer, setSelectedServer] =
    useState<AgentStudioServerRecord | null>(null);
  const [selectedAssistant, setSelectedAssistant] =
    useState<LangGraphAssistant | null>(null);
  const [assistants, setAssistants] = useState<LangGraphAssistant[]>([]);
  const [assistantsLoading, setAssistantsLoading] = useState(false);
  const [schema, setSchema] = useState<Record<string, unknown> | undefined>(
    undefined,
  );
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [graphDef, setGraphDef] = useState<LangGraphGraphDef | undefined>(
    undefined,
  );
  const [graphDefLoading, setGraphDefLoading] = useState(false);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});

  // UI mode state
  const [rightTab, setRightTab] = useState<"interact" | "trace">("interact");
  const [addServerOpen, setAddServerOpen] = useState(false);
  const [inputCollapsed, setInputCollapsed] = useState(false);

  // Run state
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [lastRunStatus, setLastRunStatus] = useState<"idle" | "done" | "error">(
    "idle",
  );

  // Thread list state
  const [threads, setThreads] = useState<LangGraphThread[]>([]);
  // "new" = fresh run mode; a thread_id = viewing a past thread
  const [selectedView, setSelectedView] = useState<"new" | string>("new");

  const {
    listAssistants,
    getSchema,
    getGraphDef,
    getThread,
    createThread,
    streamRun,
    proxyFetch,
  } = useLangGraphApi(
    projectId,
    selectedServer?.id ?? null,
    selectedServer?.serverUrl ?? null,
  );
  const { state: streamState, run, cancel, reset } = useAgentStream();

  const { data: servers } = api.agentStudio.listServers.useQuery(
    { projectId },
    { enabled: !!projectId },
  );

  // Fetch threads from LangGraph server
  const fetchThreads = useCallback(async () => {
    if (!selectedServer) return;
    try {
      const res = await proxyFetch("threads/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 30 }),
      });
      if (res.ok) {
        const data = (await res.json()) as LangGraphThread[];
        setThreads(data);
      }
    } catch {
      /* ignore */
    }
  }, [selectedServer, proxyFetch]);

  useEffect(() => {
    if (!selectedServer && servers && servers.length > 0) {
      setSelectedServer(servers[0] as unknown as AgentStudioServerRecord);
    }
  }, [servers, selectedServer]);

  useEffect(() => {
    if (!selectedServer) return;
    setAssistants([]);
    setSelectedAssistant(null);
    setSchema(undefined);
    setAssistantsLoading(true);
    listAssistants()
      .then((data) => {
        setAssistants(data);
        if (data.length > 0) setSelectedAssistant(data[0] ?? null);
      })
      .catch(() => setAssistants([]))
      .finally(() => setAssistantsLoading(false));
    void fetchThreads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedServer?.id]);

  useEffect(() => {
    if (!selectedAssistant) return;
    setSchemaLoading(true);
    setGraphDefLoading(true);
    setSchema(undefined);
    setGraphDef(undefined);
    setInputValues({});
    setLastRunStatus("idle");
    setCurrentThreadId(null);
    reset();
    getSchema(selectedAssistant.assistant_id)
      .then((s) => setSchema(s))
      .catch(() => setSchema(undefined))
      .finally(() => setSchemaLoading(false));
    getGraphDef(selectedAssistant.assistant_id)
      .then((g) => setGraphDef(g))
      .catch(() => setGraphDef(undefined))
      .finally(() => setGraphDefLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAssistant?.assistant_id]);

  const handleRun = useCallback(
    async (overrideInput?: Record<string, unknown>) => {
      if (!selectedAssistant) return;
      reset();
      setSelectedView("new");
      setRunStartedAt(Date.now());
      setLastRunStatus("idle");
      setCurrentThreadId(null);
      setRightTab("interact");
      try {
        const thread = await createThread();
        setCurrentThreadId(thread.thread_id);
        const input = overrideInput ?? prepareInput(inputValues);
        const stream = streamRun(
          thread.thread_id,
          selectedAssistant.assistant_id,
          input,
        );
        if (stream) {
          await run(stream);
          try {
            const t = await getThread(thread.thread_id);
            setLastRunStatus(t.status === "error" ? "error" : "done");
          } catch {
            setLastRunStatus("done");
          }
          void fetchThreads();
        }
      } catch (err) {
        console.error("Run failed", err);
        setLastRunStatus("error");
      }
    },
    [
      selectedAssistant,
      inputValues,
      createThread,
      streamRun,
      run,
      reset,
      getThread,
      fetchThreads,
    ],
  );

  const handleNewThread = useCallback(() => {
    reset();
    setSelectedView("new");
    setCurrentThreadId(null);
    setLastRunStatus("idle");
    setRunStartedAt(null);
  }, [reset]);

  const isRunning = streamState.status === "running";
  const activeNodeName =
    streamState.status === "running" && streamState.events.length > 0
      ? (streamState.events.filter((e) => e.type === "updates").at(-1)
          ?.nodeName ?? null)
      : null;

  // Trace timestamp: current run's startedAt, or for a past thread its created_at
  const traceTimestamp: number | null = (() => {
    if (selectedView === "new") return runStartedAt;
    const t = threads.find((th) => th.thread_id === selectedView);
    return t ? new Date(t.created_at).getTime() : null;
  })();

  const noServers = !servers || servers.length === 0;

  return (
    <Page
      headerProps={{
        title: "Agent Studio",
        help: {
          description:
            "Connect any LangGraph server to run graphs and debug agents interactively.",
          href: "https://langfuse.com/docs",
        },
      }}
    >
      {noServers ? (
        <EmptyServerState onAddServer={() => setAddServerOpen(true)} />
      ) : (
        <ResizablePanelGroup orientation="horizontal" className="h-full">
          {/* Center: graph selector + visualization + input */}
          <ResizablePanel
            id="agent-studio-center"
            defaultSize="50%"
            minSize="30%"
          >
            <div className="flex h-full flex-col">
              {/* Header — always visible */}
              <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-foreground h-7 shrink-0 gap-1 px-2 text-xs"
                  onClick={() => setAddServerOpen(true)}
                  title={selectedServer?.serverUrl ?? "Configure server"}
                >
                  <Settings className="h-3 w-3" />
                  <span className="max-w-[90px] truncate">
                    {selectedServer
                      ? (() => {
                          try {
                            return new URL(selectedServer.serverUrl).host;
                          } catch {
                            return selectedServer.serverUrl;
                          }
                        })()
                      : "Configure"}
                  </span>
                </Button>
                <Separator orientation="vertical" className="h-4" />
                <Select
                  value={selectedAssistant?.assistant_id ?? ""}
                  onValueChange={(val) => {
                    const a = assistants.find((x) => x.assistant_id === val);
                    if (a) {
                      setSelectedAssistant(a);
                      handleNewThread();
                    }
                  }}
                >
                  <SelectTrigger className="h-7 w-44 font-mono text-xs">
                    <SelectValue
                      placeholder={
                        assistantsLoading ? "Loading graphs…" : "Select a graph"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {assistants.map((a) => (
                      <SelectItem
                        key={a.assistant_id}
                        value={a.assistant_id}
                        className="font-mono text-xs"
                      >
                        {a.name || a.graph_id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedAssistant && (
                  <div className="ml-auto flex items-center gap-1">
                    <Separator orientation="vertical" className="mx-1 h-4" />
                    {isRunning && (
                      <div className="text-muted-foreground flex items-center gap-1 text-xs">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Running…
                      </div>
                    )}
                    {!isRunning && lastRunStatus === "done" && (
                      <div className="flex items-center gap-1 text-xs text-green-600">
                        <CheckCircle2 className="h-3 w-3" />
                        Done
                      </div>
                    )}
                    {!isRunning && lastRunStatus === "error" && (
                      <div className="text-destructive flex items-center gap-1 text-xs">
                        <XCircle className="h-3 w-3" />
                        Error
                      </div>
                    )}
                    {isRunning ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={cancel}
                        className="h-7"
                      >
                        <Square className="mr-1.5 h-3 w-3" />
                        Stop
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => void handleRun()}
                        disabled={isRunning}
                        className="h-7"
                      >
                        <Play className="mr-1.5 h-3.5 w-3.5" />
                        Run
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {!selectedAssistant ? (
                <div className="flex flex-1 items-center justify-center">
                  <p className="text-muted-foreground text-sm">
                    {assistantsLoading
                      ? "Loading graphs…"
                      : "Select a graph to get started"}
                  </p>
                </div>
              ) : (
                <>
                  <div className="min-h-0 flex-1">
                    <GraphView
                      graphDef={graphDef}
                      isLoading={graphDefLoading}
                      activeNodeName={activeNodeName}
                    />
                  </div>

                  {/* Docked input at bottom */}
                  <div className="bg-card shrink-0 border-t">
                    <button
                      className="hover:bg-muted/40 flex w-full items-center gap-2 px-3 py-2 text-left"
                      onClick={() => setInputCollapsed((v) => !v)}
                    >
                      <span className="text-sm font-medium">Input</span>
                      <ChevronDown
                        className={`text-muted-foreground h-3.5 w-3.5 transition-transform ${inputCollapsed ? "-rotate-90" : ""}`}
                      />
                    </button>
                    {!inputCollapsed && (
                      <div className="flex max-h-72 flex-col gap-3 overflow-y-auto px-3 pb-3">
                        <InputForm
                          schema={schema}
                          isLoading={schemaLoading}
                          values={inputValues}
                          onChange={setInputValues}
                        />
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Right: thread selector + timeline */}
          <ResizablePanel
            id="agent-studio-right"
            defaultSize="50%"
            minSize="30%"
          >
            <div className="flex h-full flex-col">
              {/* Thread selector header */}
              <div className="flex items-center gap-2 border-b px-3 py-2">
                <Select
                  value={selectedView}
                  onValueChange={(val) => {
                    if (val === "new") {
                      handleNewThread();
                    } else {
                      setSelectedView(val);
                    }
                  }}
                >
                  <SelectTrigger className="h-7 flex-1 truncate font-mono text-xs">
                    <SelectValue>
                      {selectedView === "new"
                        ? currentThreadId
                          ? `Thread ${currentThreadId.slice(0, 14)}…`
                          : "New Thread"
                        : `Thread ${selectedView.slice(0, 14)}…`}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new" className="font-mono text-xs">
                      {currentThreadId
                        ? `Thread ${currentThreadId.slice(0, 14)}…`
                        : "New Thread"}
                    </SelectItem>
                    {threads
                      .filter((t) => t.thread_id !== currentThreadId)
                      .map((t) => (
                        <SelectItem
                          key={t.thread_id}
                          value={t.thread_id}
                          className="font-mono text-xs"
                        >
                          <span className="flex items-center gap-1.5">
                            <span>{t.thread_id.slice(0, 14)}…</span>
                            <Badge
                              variant={
                                THREAD_STATUS_VARIANT[t.status] ?? "outline"
                              }
                              className="px-1 py-0 text-[10px]"
                            >
                              {t.status}
                            </Badge>
                            <span className="text-muted-foreground">
                              {new Date(t.updated_at).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>

                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 gap-1 px-2 text-xs"
                  onClick={handleNewThread}
                >
                  <Plus className="h-3 w-3" />
                  New
                </Button>
              </div>

              {/* Interact / Trace tabs */}
              <div className="flex border-b">
                {(["interact", "trace"] as const).map((tab) => (
                  <button
                    key={tab}
                    className={`px-4 py-1.5 text-xs font-medium capitalize transition-colors ${
                      rightTab === tab
                        ? "border-primary text-primary border-b-2"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={() => setRightTab(tab)}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <ScrollArea className="flex-1">
                {rightTab === "interact" ? (
                  selectedView === "new" ? (
                    <RunTimeline
                      streamState={streamState}
                      inputValues={inputValues}
                      runStartedAt={runStartedAt}
                    />
                  ) : (
                    <PastThreadInteract
                      thread={
                        threads.find((t) => t.thread_id === selectedView) ??
                        null
                      }
                      projectId={projectId}
                      serverId={selectedServer?.id ?? null}
                    />
                  )
                ) : (
                  <TracePanel
                    startedAt={traceTimestamp}
                    projectId={projectId}
                  />
                )}
              </ScrollArea>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      )}

      <ServerConfigSheet
        open={addServerOpen}
        onClose={() => setAddServerOpen(false)}
        projectId={projectId}
        server={selectedServer}
      />
    </Page>
  );
}

// LangGraph checkpoint history entry (GET /threads/{id}/history?limit=N)
// Note: metadata.writes is not populated by the LangGraph HTTP API.
// Instead we use: `next` to identify which node ran, and `values` diffs
// between consecutive checkpoints for the actual state change data.
type HistoryCheckpoint = {
  values?: Record<string, unknown>;
  next?: string[];
  metadata?: {
    source?: string;
    step?: number;
  };
  created_at?: string;
};

function historyToResult(history: HistoryCheckpoint[]): {
  events: NodeEvent[];
  inputValues: Record<string, string>;
} {
  if (history.length === 0) return { events: [], inputValues: {} };

  const events: NodeEvent[] = [];
  let inputValues: Record<string, string> = {};

  // Sort: use metadata.step when available, fall back to created_at ordering
  const hasSteps = history.some((cp) => cp.metadata?.step !== undefined);
  const sorted = [...history].sort((a, b) => {
    if (hasSteps) return (a.metadata?.step ?? 0) - (b.metadata?.step ?? 0);
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return ta - tb;
  });

  for (let i = 0; i < sorted.length; i++) {
    const cp = sorted[i];
    const step = cp.metadata?.step ?? i - 1;
    const source = cp.metadata?.source;
    const ts = cp.created_at ? new Date(cp.created_at).getTime() : Date.now();
    const vals = cp.values ?? {};

    // Input checkpoint or first checkpoint → extract as inputValues
    if (source === "input" || (!source && i === 0)) {
      for (const [k, v] of Object.entries(vals)) {
        inputValues[k] = typeof v === "string" ? v : JSON.stringify(v);
      }
      continue;
    }

    // step=0 loop = after __start__ applied input — also use as inputValues
    if (step === 0 && source === "loop") {
      for (const [k, v] of Object.entries(vals)) {
        inputValues[k] = typeof v === "string" ? v : JSON.stringify(v);
      }
      continue;
    }

    // Any subsequent checkpoint (loop or unknown source) — reconstruct as node event
    const isLoop = source === "loop" || !source;
    if (isLoop && i > 0) {
      const prevCp = sorted[i - 1]!;

      // Node names from prev.next; fall back to "step_N" when next is unavailable
      const fromNext = (prevCp.next ?? []).filter((n) => n !== "__start__");
      const nodeNames = fromNext.length > 0 ? fromNext : [`step_${step}`];

      // Diff consecutive values to find what changed
      const prevVals = prevCp.values ?? {};
      const diff: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(vals)) {
        if (JSON.stringify(v) !== JSON.stringify(prevVals[k])) diff[k] = v;
      }

      for (const nodeName of nodeNames) {
        events.push({
          id: `${nodeName}-${ts}-hist`,
          nodeName,
          type: "updates",
          data: Object.keys(diff).length > 0 ? diff : null,
          durationMs: 0,
          receivedAt: ts,
          status: "success",
        });
      }
    }
  }

  // Fallback: if reconstruction produced nothing, surface the final state as inputValues
  if (events.length === 0 && sorted.length > 0) {
    const last = sorted[sorted.length - 1]!;
    for (const [k, v] of Object.entries(last.values ?? {})) {
      inputValues[k] = typeof v === "string" ? v : JSON.stringify(v);
    }
  }

  return { events, inputValues };
}

// Shows the same RunTimeline UI for past threads by fetching their checkpoint history
function PastThreadInteract({
  thread,
  projectId,
  serverId,
}: {
  thread: LangGraphThread | null;
  projectId: string;
  serverId: string | null;
}) {
  const [result, setResult] = useState<{
    events: NodeEvent[];
    inputValues: Record<string, string>;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const { proxyFetch } = useLangGraphApi(projectId, serverId);

  useEffect(() => {
    if (!thread) return;
    setLoading(true);
    setResult(null);
    proxyFetch(`threads/${thread.thread_id}/history?limit=100`)
      .then((res) => {
        if (!res.ok) throw new Error("history fetch failed");
        return res.json() as Promise<HistoryCheckpoint[]>;
      })
      .then((history) => setResult(historyToResult(history)))
      .catch(() => setResult({ events: [], inputValues: {} }))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread?.thread_id]);

  if (loading || (result === null && thread !== null)) {
    return (
      <div className="flex flex-col gap-2 p-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  if (!thread || result === null) {
    return (
      <div className="text-muted-foreground flex items-center justify-center px-4 py-10 text-xs">
        Select a thread to view its execution history
      </div>
    );
  }

  const syntheticState: StreamState =
    thread.status === "error"
      ? {
          status: "error",
          events: result.events,
          error: "Thread completed with error",
          runId: null,
        }
      : { status: "done", events: result.events, runId: null };

  return (
    <RunTimeline
      streamState={syntheticState}
      inputValues={result.inputValues}
      runStartedAt={new Date(thread.created_at).getTime()}
    />
  );
}
