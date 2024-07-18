import { StarIcon } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { api } from "@/src/utils/api";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { cn } from "@/src/utils/tailwind";
import { type RouterOutput, type RouterInput } from "@/src/utils/types";
import { useState } from "react";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";

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
          value ? "fill-current text-yellow-500" : "text-muted-foreground",
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
  tracesFilter: RouterInput["traces"]["all"];
  projectId: string;
  traceId: string;
  value: boolean;
  size?: "sm" | "xs";
}) {
  const utils = api.useUtils();
  const hasAccess = useHasAccess({ projectId, scope: "objects:bookmark" });
  const capture = usePostHogClientCapture();
  const [isLoading, setIsLoading] = useState(false);

  const mutBookmarkTrace = api.traces.bookmark.useMutation({
    // Optimistic update
    // Tanstack docs: https://tanstack.com/query/v4/docs/react/guides/optimistic-updates

    onMutate: async () => {
      // Cancel any outgoing refetches
      // (so they don't overwrite our optimistic update)
      await utils.traces.all.cancel();

      setIsLoading(true);

      // Snapshot the previous value
      const prev = utils.traces.all.getData(tracesFilter);

      return { prev };
    },
    onError: (err, _newTodo, context) => {
      setIsLoading(false);
      // Rollback to the previous value if mutation fails
      trpcErrorToast(err);
      utils.traces.all.setData(tracesFilter, context?.prev);
    },
    onSettled: () => {
      setIsLoading(false);
      utils.traces.all.setData(
        tracesFilter,
        (oldQueryData: RouterOutput["traces"]["all"] | undefined) => {
          return {
            totalCount: oldQueryData?.totalCount,
            traces: oldQueryData?.traces
              ? oldQueryData.traces.map((trace) => {
                  return {
                    ...trace,
                    bookmarked:
                      trace.id === traceId
                        ? !trace.bookmarked
                        : trace.bookmarked,
                  };
                })
              : [],
          };
        },
      );
      void utils.traces.all.invalidate();
    },
  });

  return (
    <StarToggle
      value={value}
      size={size}
      disabled={!hasAccess}
      isLoading={isLoading}
      onClick={(value) => {
        capture("table:bookmark_button_click", {
          table: "traces",
          id: traceId,
          value: value,
        });
        return mutBookmarkTrace.mutateAsync({
          projectId,
          traceId,
          bookmarked: value,
        });
      }}
    />
  );
}

export function StarTraceDetailsToggle({
  projectId,
  traceId,
  value,
  size = "sm",
}: {
  projectId: string;
  traceId: string;
  value: boolean;
  size?: "sm" | "xs";
}) {
  const utils = api.useUtils();
  const hasAccess = useHasAccess({ projectId, scope: "objects:bookmark" });
  const capture = usePostHogClientCapture();
  const [isLoading, setIsLoading] = useState(false);

  const mutBookmarkTrace = api.traces.bookmark.useMutation({
    onMutate: async () => {
      // Cancel any outgoing refetches
      // (so they don't overwrite our optimistic update)
      await utils.traces.byId.cancel();

      setIsLoading(true);

      // Snapshot the previous value
      const prevData = utils.traces.byId.getData({ traceId });

      return { prevData };
    },
    onError: (err, _newTodo, context) => {
      setIsLoading(false);
      trpcErrorToast(err);
      // Rollback to the previous value if mutation fails
      utils.traces.byId.setData({ traceId }, context?.prevData);
    },
    onSettled: () => {
      setIsLoading(false);

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
      void utils.traces.byId.invalidate();
      void utils.traces.all.invalidate();
    },
  });

  return (
    <StarToggle
      value={value}
      size={size}
      disabled={!hasAccess}
      isLoading={isLoading}
      onClick={(value) => {
        capture("trace_detail:bookmark_button_click", {
          id: traceId,
          value: value,
        });
        return mutBookmarkTrace.mutateAsync({
          projectId,
          traceId,
          bookmarked: value,
        });
      }}
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
  const capture = usePostHogClientCapture();
  const mutBookmarkSession = api.sessions.bookmark.useMutation({
    onSuccess: () => {
      void utils.sessions.invalidate();
    },
  });

  return (
    <StarToggle
      value={value}
      size={size}
      isLoading={mutBookmarkSession.isLoading}
      disabled={!hasAccess}
      onClick={(value) => {
        capture("table:bookmark_button_click", {
          table: "sessions",
          id: sessionId,
          value: value,
        });
        return mutBookmarkSession.mutateAsync({
          projectId,
          sessionId,
          bookmarked: value,
        });
      }}
    />
  );
}
