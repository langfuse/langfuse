import React, { useCallback, useEffect, useState } from "react";
import { RefreshCw, Copy, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Badge } from "@/src/components/ui/badge";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import { Skeleton } from "@/src/components/ui/skeleton";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { type LangGraphThread } from "../types";
import { useLangGraphApi } from "../hooks/useLangGraphApi";
import { copyTextToClipboard } from "@/src/utils/clipboard";

type Props = {
  projectId: string;
  serverId: string | null;
  autoExpandThreadId?: string | null;
  onRefreshRef?: React.RefObject<(() => void) | null>;
};

const STATUS_VARIANT: Record<string, "outline" | "secondary" | "destructive"> =
  {
    idle: "outline",
    busy: "secondary",
    error: "destructive",
    interrupted: "secondary",
  };

export function ThreadList({
  projectId,
  serverId,
  autoExpandThreadId,
  onRefreshRef,
}: Props) {
  const [threads, setThreads] = useState<LangGraphThread[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [threadStates, setThreadStates] = useState<Record<string, unknown>>({});
  const [loadingState, setLoadingState] = useState<string | null>(null);

  const { proxyFetch, getThreadState } = useLangGraphApi(projectId, serverId);

  const fetchThreads = useCallback(async () => {
    if (!serverId) return;
    setLoading(true);
    try {
      const res = await proxyFetch("threads/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 20 }),
      });
      if (res.ok) {
        const data = (await res.json()) as LangGraphThread[];
        setThreads(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [serverId, proxyFetch]);

  useEffect(() => {
    void fetchThreads();
  }, [fetchThreads]);

  // Expose refresh function to parent
  useEffect(() => {
    if (onRefreshRef) onRefreshRef.current = fetchThreads;
  }, [fetchThreads, onRefreshRef]);

  // Auto-expand thread when parent signals a new run completed
  useEffect(() => {
    if (!autoExpandThreadId) return;
    setExpandedId(autoExpandThreadId);
    // Load state for this thread
    if (!threadStates[autoExpandThreadId]) {
      setLoadingState(autoExpandThreadId);
      getThreadState(autoExpandThreadId)
        .then((state) =>
          setThreadStates((prev) => ({ ...prev, [autoExpandThreadId]: state })),
        )
        .catch(() =>
          setThreadStates((prev) => ({
            ...prev,
            [autoExpandThreadId]: { error: "Failed to load thread state" },
          })),
        )
        .finally(() => setLoadingState(null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoExpandThreadId]);

  const toggleThread = async (thread: LangGraphThread) => {
    if (expandedId === thread.thread_id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(thread.thread_id);
    if (!threadStates[thread.thread_id]) {
      setLoadingState(thread.thread_id);
      try {
        const state = await getThreadState(thread.thread_id);
        setThreadStates((prev) => ({ ...prev, [thread.thread_id]: state }));
      } catch {
        setThreadStates((prev) => ({
          ...prev,
          [thread.thread_id]: { error: "Failed to load thread state" },
        }));
      } finally {
        setLoadingState(null);
      }
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
          Threads
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={fetchThreads}
          disabled={loading}
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {loading && (
          <div className="flex flex-col gap-2 px-3 py-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full rounded-md" />
            ))}
          </div>
        )}
        {!loading && threads.length === 0 && (
          <p className="text-muted-foreground px-3 py-4 text-center text-xs">
            No threads yet. Run an agent to create one.
          </p>
        )}
        {!loading &&
          threads.map((thread) => {
            const isExpanded = expandedId === thread.thread_id;
            const state = threadStates[thread.thread_id];
            const isLoadingThis = loadingState === thread.thread_id;

            return (
              <div key={thread.thread_id} className="border-b last:border-0">
                <button
                  className="hover:bg-muted/40 flex w-full items-start gap-1.5 px-3 py-2 text-left"
                  onClick={() => void toggleThread(thread)}
                >
                  {isExpanded ? (
                    <ChevronDown className="text-muted-foreground mt-0.5 h-3 w-3 shrink-0" />
                  ) : (
                    <ChevronRight className="text-muted-foreground mt-0.5 h-3 w-3 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground truncate font-mono text-xs">
                        {thread.thread_id.slice(0, 14)}…
                      </span>
                      <button
                        className="hover:bg-muted shrink-0 rounded p-0.5"
                        onClick={(e) => {
                          e.stopPropagation();
                          void copyTextToClipboard(thread.thread_id);
                        }}
                      >
                        <Copy className="h-2.5 w-2.5" />
                      </button>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <Badge
                        variant={STATUS_VARIANT[thread.status] ?? "outline"}
                        className="text-xs"
                      >
                        {thread.status}
                      </Badge>
                      <span className="text-muted-foreground text-xs">
                        {new Date(thread.updated_at).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <div className="bg-muted/20 border-t px-3 py-2">
                    {isLoadingThis ? (
                      <Skeleton className="h-20 w-full" />
                    ) : state ? (
                      <PrettyJsonView
                        json={state}
                        collapseStringsAfterLength={80}
                      />
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
      </ScrollArea>
    </div>
  );
}
