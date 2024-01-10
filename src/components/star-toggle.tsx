import { StarIcon } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { api } from "@/src/utils/api";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { cn } from "@/src/utils/tailwind";
import { useOptimisticUpdate } from "@/src/features/tag/useOptimisticUpdate";
import { type RouterOutput, type RouterInput } from "@/src/utils/types";

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
  tracesFilter,
  projectId,
  traceId,
  value,
  size = "sm",
  index,
}: {
  //api.traces.all.useQueryKey
  tracesFilter: RouterInput["traces"]["all"];
  projectId: string;
  traceId: string;
  value: boolean;
  size?: "sm" | "xs";
  index: number;
}) {
  const utils = api.useUtils();
  const hasAccess = useHasAccess({ projectId, scope: "objects:bookmark" });

  const mutBookmarkTrace = api.traces.bookmark.useMutation({
    onMutate: async () => {
      // Cancel any outgoing refetches
      // (so they don't overwrite our optimistic update)
      await utils.traces.all.cancel();

      // Snapshot the previous value
      const prev = utils.traces.all.getData(tracesFilter);

      // Optimistically update to the new value
      utils.traces.all.setData(
        tracesFilter,
        (oldQueryData: RouterOutput["traces"]["all"] | undefined) => {
          return oldQueryData
            ? oldQueryData.map((trace) => {
                return {
                  ...trace,
                  bookmarked:
                    trace.id === traceId ? !trace.bookmarked : trace.bookmarked,
                };
              })
            : [];
        },
      );
      return { prev };
    },
    onError: (err, _newTodo, context) => {
      // Rollback to the previous value if mutation fails
      utils.traces.all.setData(tracesFilter, context?.prev);
    },
    onSettled: () => {
      void utils.traces.all.invalidate();
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
