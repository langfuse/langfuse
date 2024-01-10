import { StarIcon } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { api } from "@/src/utils/api";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { cn } from "@/src/utils/tailwind";
import { type RouterOutput, type RouterInput } from "@/src/utils/types";
import { useState } from "react";

export function StarToggle({
  value,
  disabled = false,
  onClick,
  size = "sm",
  isLoading,
}: {
  value: boolean;
  disabled?: boolean;
  onClick: (value: boolean) => Promise<unknown>;
  size?: "sm" | "xs";
  isLoading: boolean;
}) {
  return (
    <Button
      variant="ghost"
      size={size}
      onClick={() => void onClick(!value)}
      disabled={disabled}
      loading={isLoading}
    >
      <StarIcon
        className={cn(
          "h-4 w-4",
          value ? "fill-current text-yellow-500" : "text-gray-500",
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
}: {
  //api.traces.all.useQueryKey
  tracesFilter?: RouterInput["traces"]["all"];
  projectId: string;
  traceId: string;
  value: boolean;
  size?: "sm" | "xs";
}) {
  const utils = api.useUtils();
  const hasAccess = useHasAccess({ projectId, scope: "objects:bookmark" });

  const [isLoading, setIsLoading] = useState(false);

  const mutBookmarkTrace = api.traces.bookmark.useMutation({
    onMutate: async () => {
      // Cancel any outgoing refetches
      // (so they don't overwrite our optimistic update)
      await utils.traces.all.cancel();
      await utils.traces.byId.cancel();

      setIsLoading(true);

      // Snapshot the previous value
      const prev = utils.traces.all.getData(tracesFilter);
      const prevById = utils.traces.byId.getData({ traceId });

      return { prev, prevById };
    },
    onError: (err, _newTodo, context) => {
      setIsLoading(false);
      // Rollback to the previous value if mutation fails
      tracesFilter
        ? utils.traces.all.setData(tracesFilter, context?.prev)
        : undefined;
      utils.traces.byId.setData({ traceId }, context?.prevById);
    },
    onSettled: () => {
      setIsLoading(false);
      // Optimistically update to the new value
      tracesFilter
        ? utils.traces.all.setData(
            tracesFilter,
            (oldQueryData: RouterOutput["traces"]["all"] | undefined) => {
              return oldQueryData
                ? oldQueryData.map((trace) => {
                    return {
                      ...trace,
                      bookmarked:
                        trace.id === traceId
                          ? !trace.bookmarked
                          : trace.bookmarked,
                    };
                  })
                : [];
            },
          )
        : undefined;

      utils.traces.byId.setData(
        { traceId },
        (oldQueryData: RouterOutput["traces"]["byId"] | undefined) => {
          return oldQueryData
            ? {
                ...oldQueryData,
                bookmarked: !oldQueryData.bookmarked,
              }
            : undefined;
        },
      );
      void utils.traces.all.invalidate();
      void utils.traces.byId.invalidate();
    },
  });

  return (
    <StarToggle
      value={value}
      size={size}
      disabled={!hasAccess}
      isLoading={isLoading}
      onClick={(value) =>
        mutBookmarkTrace.mutateAsync({
          projectId,
          traceId,
          bookmarked: value,
        })
      }
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
      isLoading={mutBookmarkSession.isLoading}
      onClick={(value) =>
        mutBookmarkSession.mutateAsync({
          projectId,
          sessionId,
          bookmarked: value,
        })
      }
    />
  );
}
