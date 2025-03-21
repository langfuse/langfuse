import { StarIcon } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { api } from "@/src/utils/api";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { type RouterOutput, type RouterInput } from "@/src/utils/types";
import { useState } from "react";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";

export function StarToggle({
  value,
  disabled = false,
  onClick,
  size = "icon",
  isLoading,
}: {
  value: boolean;
  disabled?: boolean;
  onClick: (value: boolean) => Promise<unknown>;
  size?: "icon" | "icon-xs";
  isLoading: boolean;
}) {
  return (
    <Button
      variant="ghost"
      size={size}
      onClick={(e) => {
        e.stopPropagation();
        void onClick(!value);
      }}
      disabled={disabled}
      loading={isLoading}
      aria-label="bookmark"
    >
      <StarIcon
        className="h-4 w-4"
        fill={value ? "#facc15" : "none"}
        stroke={value ? "#ca8a04" : "currentColor"}
        strokeWidth={2}
      />
    </Button>
  );
}

// use by the trace table
export function StarTraceToggle({
  tracesFilter,
  projectId,
  traceId,
  value,
  size = "icon",
}: {
  tracesFilter: RouterInput["traces"]["all"];
  projectId: string;
  traceId: string;
  value: boolean;
  size?: "icon" | "icon-xs";
}) {
  const utils = api.useUtils();
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "objects:bookmark",
  });
  const capture = usePostHogClientCapture();
  const [isLoading, setIsLoading] = useState(false);

  const mutBookmarkTrace = api.traces.bookmark.useMutation({
    onMutate: async (newBookmarkState) => {
      await utils.traces.all.cancel();
      setIsLoading(true);

      const previousData = utils.traces.all.getData(tracesFilter);

      utils.traces.all.setData(tracesFilter, (old) => {
        if (!old) return old;
        return {
          ...old,
          traces: old.traces.map((trace) =>
            trace.id === traceId
              ? { ...trace, bookmarked: newBookmarkState.bookmarked }
              : trace,
          ),
        };
      });

      return { previousData };
    },
    onError: (err, newBookmarkState, context) => {
      setIsLoading(false);
      trpcErrorToast(err);
      if (context?.previousData) {
        utils.traces.all.setData(tracesFilter, context.previousData);
      }
    },
    onSettled: () => {
      setIsLoading(false);
      void utils.traces.all.invalidate();
    },
  });

  return (
    <StarToggle
      value={value}
      size={size}
      disabled={!hasAccess}
      isLoading={isLoading}
      onClick={(newValue) => {
        capture("table:bookmark_button_click", {
          table: "traces",
          id: traceId,
          value: newValue,
        });
        return mutBookmarkTrace.mutateAsync({
          projectId,
          traceId,
          bookmarked: newValue,
        });
      }}
    />
  );
}

// use by the single trace view
export function StarTraceDetailsToggle({
  projectId,
  traceId,
  timestamp,
  value,
  size = "icon",
}: {
  projectId: string;
  traceId: string;
  timestamp?: Date;
  value: boolean;
  size?: "icon" | "icon-xs";
}) {
  const utils = api.useUtils();
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "objects:bookmark",
  });
  const capture = usePostHogClientCapture();
  const [isLoading, setIsLoading] = useState(false);

  const mutBookmarkTrace = api.traces.bookmark.useMutation({
    onMutate: async () => {
      // Cancel any outgoing refetches
      // (so they don't overwrite our optimistic update)
      await utils.traces.byIdWithObservationsAndScores.cancel();

      setIsLoading(true);

      // Snapshot the previous value
      const prevData = utils.traces.byIdWithObservationsAndScores.getData({
        traceId,
        projectId,
        timestamp,
      });

      return { prevData };
    },
    onError: (err, _newTodo, context) => {
      setIsLoading(false);
      trpcErrorToast(err);
      // Rollback to the previous value if mutation fails
      utils.traces.byIdWithObservationsAndScores.setData(
        { traceId, projectId, timestamp },
        context?.prevData,
      );
    },
    onSettled: () => {
      setIsLoading(false);

      utils.traces.byIdWithObservationsAndScores.setData(
        { traceId, projectId, timestamp },
        (
          oldQueryData:
            | RouterOutput["traces"]["byIdWithObservationsAndScores"]
            | undefined,
        ) => {
          return oldQueryData
            ? {
                ...oldQueryData,
                bookmarked: !oldQueryData.bookmarked,
              }
            : undefined;
        },
      );
      void utils.traces.byIdWithObservationsAndScores.invalidate();
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
  size = "icon",
}: {
  projectId: string;
  sessionId: string;
  value: boolean;
  size?: "icon" | "icon-xs";
}) {
  const utils = api.useUtils();
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "objects:bookmark",
  });
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
