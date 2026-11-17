import { TablePeekViewTraceDetail } from "@/src/components/table/peek/TablePeekViewTraceDetail";
import { useEffect, useRef, useState } from "react";
import { buildTracePath } from "@langfuse/shared";
import { SessionTracePeekNavigationProvider } from "./SessionTracePeekNavigationProvider";

export function SessionTracePeek({
  projectId,
  search,
  onClose,
}: {
  projectId: string;
  search: string;
  onClose: () => void;
}) {
  const params = new URLSearchParams(search);
  const traceId = params.get("peek");
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
      <SessionTracePeekNavigationProvider projectId={projectId} search={search}>
        <TablePeekViewTraceDetail
          projectId={projectId}
          itemType="TRACE"
          tableName="session-detail"
          isV4
          layout={params.has("observation") ? "observation-focused" : "default"}
          closePeek={onClose}
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
    </div>
  );
}
