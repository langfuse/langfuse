import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import { DEFAULT_CROSS_PROJECT_TRACE_CORRELATION_KEY } from "@/src/features/trace-correlation/constants";
import { api } from "@/src/utils/api";
import { ExternalLink, Loader2, Network } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useMemo, useState } from "react";

type RelatedTracesButtonProps = {
  projectId: string;
  traceId: string;
  timestamp: Date;
  observations: Array<{
    startTime?: Date | string | null;
  }>;
  enabled: boolean;
};

const toValidDate = (value: Date | string | null | undefined) => {
  const date = value instanceof Date ? value : value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
};

const formatTraceTimestamp = (timestamp: Date) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);

export function RelatedTracesButton({
  projectId,
  traceId,
  timestamp,
  observations,
  enabled,
}: RelatedTracesButtonProps) {
  const session = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const organization = useMemo(
    () =>
      session.data?.user?.organizations.find((org) =>
        org.projects.some((project) => project.id === projectId),
      ),
    [projectId, session.data?.user?.organizations],
  );
  const observationWindow = useMemo(() => {
    const startTimes = observations.reduce<number[]>((acc, observation) => {
      const startTime = toValidDate(observation.startTime);
      if (startTime) acc.push(startTime.getTime());
      return acc;
    }, []);

    if (startTimes.length === 0) return null;

    const minStartTime = startTimes.reduce(
      (min, startTime) => Math.min(min, startTime),
      startTimes[0],
    );
    const maxStartTime = startTimes.reduce(
      (max, startTime) => Math.max(max, startTime),
      startTimes[0],
    );

    return {
      minStartTime: new Date(minStartTime),
      maxStartTime: new Date(maxStartTime),
    };
  }, [observations]);

  const queryEnabled = useMemo(() => {
    if (!enabled) return false;

    if (organization) {
      return organization.crossProjectTraceTrackingEnabled;
    }

    return session.data?.user?.admin === true;
  }, [enabled, organization, session.data?.user?.admin]);

  const relatedTraces = api.traces.relatedAcrossProjects.useQuery(
    {
      projectId,
      traceId,
      timestamp,
      minStartTime: observationWindow?.minStartTime ?? null,
      maxStartTime: observationWindow?.maxStartTime ?? null,
    },
    {
      enabled: queryEnabled && isOpen,
      staleTime: 60 * 1000,
      retry(failureCount, error) {
        if (
          error.data?.code === "UNAUTHORIZED" ||
          error.data?.code === "NOT_FOUND"
        )
          return false;
        return failureCount < 2;
      },
    },
  );

  const related = relatedTraces.data?.related ?? [];
  const correlationKey =
    relatedTraces.data?.correlationKey ??
    organization?.crossProjectTraceCorrelationKey ??
    DEFAULT_CROSS_PROJECT_TRACE_CORRELATION_KEY;

  if (!queryEnabled) {
    return null;
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1 px-2"
          title="Related traces"
        >
          <Network className="h-4 w-4" />
          <span className="hidden sm:inline">Related</span>
          {related.length > 0 ? (
            <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
              {related.length}
            </Badge>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 max-w-[calc(100vw-1rem)] p-0">
        <div className="border-b p-3">
          <div className="text-sm font-medium">Related traces</div>
          <div className="text-muted-foreground text-xs">
            Same metadata correlation value in readable projects
          </div>
        </div>
        <ScrollArea className="max-h-80">
          {relatedTraces.isLoading ? (
            <div className="text-muted-foreground flex items-center gap-2 p-3 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading related traces
            </div>
          ) : related.length > 0 && relatedTraces.data?.enabled ? (
            <div className="flex flex-col">
              {related.map((trace) => (
                <Link
                  key={`${trace.projectId}-${trace.traceId}-${trace.timestamp.toISOString()}`}
                  href={trace.htmlPath}
                  className="hover:bg-muted flex items-start justify-between gap-3 border-b p-3 text-sm last:border-b-0"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {trace.traceName || trace.traceId}
                    </div>
                    <div className="text-muted-foreground truncate text-xs">
                      {trace.projectName}
                    </div>
                    <div className="text-muted-foreground mt-1 text-xs">
                      {formatTraceTimestamp(trace.timestamp)}
                    </div>
                  </div>
                  <ExternalLink className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-muted-foreground p-3 text-sm">
              {relatedTraces.data?.correlationStatus === "missing"
                ? `Current trace has no metadata.${correlationKey} value.`
                : "No related traces found."}
            </div>
          )}
        </ScrollArea>
        <div className="text-muted-foreground border-t p-3 text-xs">
          Matched by{" "}
          <span className="font-mono">metadata.{correlationKey}</span>.
        </div>
        {relatedTraces.data?.truncated ? (
          <div className="text-muted-foreground border-t px-3 py-2 text-xs">
            Showing the first 50 matching traces.
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
