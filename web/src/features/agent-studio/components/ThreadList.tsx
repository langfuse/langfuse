import React, { useCallback, useEffect, useState } from "react";
import { RefreshCw, Copy } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Badge } from "@/src/components/ui/badge";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import { Skeleton } from "@/src/components/ui/skeleton";
import { type LangGraphThread } from "../types";
import { useLangGraphApi } from "../hooks/useLangGraphApi";
import { copyTextToClipboard } from "@/src/utils/clipboard";

type Props = {
  projectId: string;
  serverId: string | null;
};

const STATUS_VARIANT: Record<
  string,
  "outline" | "secondary" | "destructive"
> = {
  idle: "outline",
  busy: "secondary",
  error: "destructive",
  interrupted: "secondary",
};

export function ThreadList({ projectId, serverId }: Props) {
  const [threads, setThreads] = useState<LangGraphThread[]>([]);
  const [loading, setLoading] = useState(false);
  const { proxyFetch } = useLangGraphApi(projectId, serverId);

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

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">
            No threads yet. Run an agent to create one.
          </p>
        )}
        {!loading &&
          threads.map((thread) => (
            <div
              key={thread.thread_id}
              className="flex flex-col gap-0.5 border-b px-3 py-2 last:border-0"
            >
              <div className="flex items-center justify-between gap-1">
                <span className="truncate font-mono text-xs text-muted-foreground">
                  {thread.thread_id.slice(0, 16)}…
                </span>
                <button
                  className="shrink-0 rounded p-0.5 hover:bg-muted"
                  onClick={() => void copyTextToClipboard(thread.thread_id)}
                >
                  <Copy className="h-3 w-3" />
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge
                  variant={STATUS_VARIANT[thread.status] ?? "outline"}
                  className="text-xs"
                >
                  {thread.status}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(thread.updated_at).toLocaleTimeString()}
                </span>
              </div>
            </div>
          ))}
      </ScrollArea>
    </div>
  );
}
