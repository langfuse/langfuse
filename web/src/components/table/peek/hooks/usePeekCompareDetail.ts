import { useRouter } from "next/router";
import { useState, useCallback } from "react";

export function usePeekCompareDetail(projectId: string) {
  const [collapsedNodes, setCollapsedNodes] = useState<string[]>([]);

  const router = useRouter();
  const traceId = router.query.traceId as string;

  const toggleCollapsedNode = useCallback((id: string) => {
    setCollapsedNodes((prevNodes) => {
      if (prevNodes.includes(id)) {
        return prevNodes.filter((i) => i !== id);
      } else {
        return [...prevNodes, id];
      }
    });
  }, []);

  const handleSetCurrentObservationId = (id?: string) => {
    if (id && traceId) {
      // Only open observations in new tabs; root selection passes undefined
      const pathname = `/project/${projectId}/traces/${encodeURIComponent(traceId)}?observation=${encodeURIComponent(id)}`;
      const pathnameWithBasePath = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${pathname}`;
      window.open(pathnameWithBasePath, "_blank", "noopener noreferrer");
    }
  };

  const handleToggleTrace = (newTraceId: string) => {
    const pathname = window.location.pathname;
    if (newTraceId === router.query.traceId) {
      // remove traceId from query params
      router.push({
        pathname: pathname,
        query: {
          ...router.query,
          traceId: undefined,
        },
      });
    } else {
      // update traceId in query params
      router.push({
        pathname: pathname,
        query: {
          ...router.query,
          traceId: encodeURIComponent(newTraceId),
        },
      });
    }

    setCollapsedNodes([]); // Reset collapsed state for new trace
  };

  return {
    collapsedNodes,
    toggleCollapsedNode,
    handleSetCurrentObservationId,
    handleToggleTrace,
  };
}
