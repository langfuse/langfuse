import { TablePeekViewTraceDetail } from "@/src/components/table/peek/TablePeekViewTraceDetail";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { buildTracePath } from "@langfuse/shared";
import {
  detailPageListKeys,
  type TraceDetailPageListEntry,
} from "@/src/features/navigate-detail-pages/DetailPageListsProvider";
import { DetailPageListsOverride } from "@/src/features/navigate-detail-pages/DetailPageListsOverride";
import { SessionTracePeekNavigationProvider } from "./SessionTracePeekNavigationProvider";
import { buildSessionTracePeekNavigationPath } from "./fns/buildSessionTracePeekNavigationPath";

export function SessionTracePeek({
  projectId,
  search,
  onClose,
  traceEntries,
}: {
  projectId: string;
  search: string;
  onClose: () => void;
  traceEntries: TraceDetailPageListEntry[];
}) {
  const router = useRouter();
  const params = new URLSearchParams(search);
  const traceId = params.get("peek");
  const canNavigate = traceEntries.some((entry) => entry.id === traceId);
  const containerRef = useRef<HTMLDivElement>(null);
  const [maxWidthPx, setMaxWidthPx] = useState<number>();

  useEffect(() => {
    const parent = containerRef.current?.closest("[data-peek-content]");
    if (!parent) return;
    const updateWidth = () =>
      setMaxWidthPx(Math.max(0, parent.getBoundingClientRect().width - 48));
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} data-session-trace-peek={traceId ? "" : undefined}>
      <DetailPageListsOverride
        overrides={{ [detailPageListKeys.sessionTraces]: traceEntries }}
      >
        <SessionTracePeekNavigationProvider
          projectId={projectId}
          search={search}
        >
          <TablePeekViewTraceDetail
            projectId={projectId}
            itemType="TRACE"
            tableName="session-detail"
            isV4
            layout={
              params.has("observation") ? "observation-focused" : "default"
            }
            closePeek={onClose}
            detailNavigationKey={
              canNavigate ? detailPageListKeys.sessionTraces : undefined
            }
            resolveDetailNavigationPath={(entry) =>
              buildSessionTracePeekNavigationPath(
                router.pathname,
                search,
                entry,
              )
            }
            disableScopeToggle
            maxWidthPx={maxWidthPx}
            expandPeek={() => {
              if (!traceId) return;
              const path = buildTracePath({ projectId, traceId });
              const url = new URL(path, window.location.origin);
              params.forEach((value, key) => {
                if (key !== "peek") url.searchParams.set(key, value);
              });
              window.open(
                `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${url.pathname}${url.search}`,
                "_blank",
              );
            }}
          />
        </SessionTracePeekNavigationProvider>
      </DetailPageListsOverride>
    </div>
  );
}
