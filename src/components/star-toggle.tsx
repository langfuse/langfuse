import { StarIcon } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { useEffect, useState } from "react";
import { api } from "@/src/utils/api";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { cn } from "@/src/utils/tailwind";
import { useOptimisticUpdate } from "@/src/features/tag/useOptimisticUpdate";

export function StarToggle({
  value,
  disabled = false,
  onClick,
  size = "sm",
  index,
}: {
  value: boolean;
  disabled?: boolean;
  onClick: (value: boolean) => Promise<unknown>;
  size?: "sm" | "xs";
  index: number;
}) {
  const { optimisticValue, loading, handleUpdate } = useOptimisticUpdate(
    value,
    onClick,
    index,
  );

  return (
    <Button
      variant="ghost"
      size={size}
      onClick={() => void handleUpdate(!optimisticValue)}
      disabled={disabled}
      loading={loading}
    >
      <StarIcon
        className={cn(
          "h-4 w-4",
          optimisticValue ? "fill-current text-yellow-500" : "text-gray-500",
        )}
      />
    </Button>
  );
}

export function StarTraceToggle({
  projectId,
  traceId,
  value,
  size = "sm",
  index,
}: {
  projectId: string;
  traceId: string;
  value: boolean;
  size?: "sm" | "xs";
  index: number;
}) {
  const utils = api.useUtils();
  const hasAccess = useHasAccess({ projectId, scope: "objects:bookmark" });
  const mutBookmarkTrace = api.traces.bookmark.useMutation({
    onMutate: () => {
      console.log("onMutate called");
      console.log("traceId", traceId);
      const prev = utils.traces.all.getData();
      console.log("stale data", prev);
      if (!prev) {
        return;
      }
      /* prev.bookmarked = !value;
      console.log("prev", prev.bookmarked);
       utils.traces.byId.setData({ traceId }, (old) => {
        if (!old) {
          return;
        }
        old.bookmarked = !value;
        return old;
      }); */
    },
    onSuccess: () => {
      void utils.traces.invalidate();
    },
  });

  return (
    <StarToggle
      value={value}
      size={size}
      disabled={!hasAccess}
      onClick={(value) =>
        mutBookmarkTrace.mutateAsync({
          projectId,
          traceId,
          bookmarked: value,
        })
      }
      index={index}
    />
  );
}

export function StarSessionToggle({
  projectId,
  sessionId,
  value,
  size = "sm",
}: {
  projectId: string;
  sessionId: string;
  value: boolean;
  size?: "sm" | "xs";
}) {
  const utils = api.useUtils();
  const hasAccess = useHasAccess({ projectId, scope: "objects:bookmark" });
  const mutBookmarkSession = api.sessions.bookmark.useMutation({
    onSuccess: () => {
      void utils.sessions.invalidate();
    },
  });

  return (
    <StarToggle
      value={value}
      size={size}
      disabled={!hasAccess}
      onClick={(value) =>
        mutBookmarkSession.mutateAsync({
          projectId,
          sessionId,
          bookmarked: value,
        })
      }
      index={1}
    />
  );
}
