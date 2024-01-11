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
  tracesFilter: RouterInput["traces"]["all"];
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

      setIsLoading(true);

      // Snapshot the previous value
      const prev = utils.traces.all.getData(tracesFilter);

      return { prev };
    },
    onError: (err, _newTodo, context) => {
      setIsLoading(false);
      // Rollback to the previous value if mutation fails
      utils.traces.all.setData(tracesFilter, context?.prev);
    },
    onSettled: () => {
      setIsLoading(false);
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
      void utils.traces.all.invalidate();
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

  const [isLoading, setIsLoading] = useState(false);

  const mutBookmarkTrace = api.traces.bookmark.useMutation({
    onMutate: async () => {
      // Cancel any outgoing refetches
      // (so they don't overwrite our optimistic update)
      await utils.traces.byId.cancel();

      setIsLoading(true);

      // Snapshot the previous value
      const prevById = utils.traces.byId.getData({ traceId });

      return { prevById };
    },
    onError: (err, _newTodo, context) => {
      setIsLoading(false);
      // Rollback to the previous value if mutation fails
      utils.traces.byId.setData({ traceId }, context?.prevById);
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
  sessionsFilter,
}: {
  projectId: string;
  sessionId: string;
  value: boolean;
  size?: "sm" | "xs";
  sessionsFilter: RouterInput["sessions"]["all"];
}) {
  const utils = api.useUtils();
  const [isLoading, setIsLoading] = useState(false);
  const hasAccess = useHasAccess({ projectId, scope: "objects:bookmark" });
  const mutBookmarkSession = api.sessions.bookmark.useMutation({
    onMutate: async () => {
      await utils.sessions.all.cancel();

      setIsLoading(true);

      // Snapshot the previous value
      const prev = utils.sessions.all.getData(sessionsFilter);

      return { prev };
    },
    onError: (err, _newTodo, context) => {
      setIsLoading(false);
      // Rollback to the previous value if mutation fails

      utils.sessions.all.setData(sessionsFilter, context?.prev);
    },
    onSettled: () => {
      setIsLoading(false);
      utils.sessions.all.setData(
        sessionsFilter,
        (oldQueryData: RouterOutput["sessions"]["all"] | undefined) => {
          return oldQueryData
            ? oldQueryData.map((session) => {
                return {
                  ...session,
                  bookmarked:
                    session.id === sessionId
                      ? !session.bookmarked
                      : session.bookmarked,
                };
              })
            : [];
        },
      );
      void utils.sessions.all.invalidate();
    },
  });

  return (
    <StarToggle
      value={value}
      size={size}
      disabled={!hasAccess}
      isLoading={isLoading}
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

export function StarSessionDetailsToggle({
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
  const [isLoading, setIsLoading] = useState(false);
  const hasAccess = useHasAccess({ projectId, scope: "objects:bookmark" });
  const mutBookmarkSession = api.sessions.bookmark.useMutation({
    onMutate: async () => {
      await utils.sessions.byId.cancel();

      setIsLoading(true);

      // Snapshot the previous value
      const prevById = utils.sessions.byId.getData({ projectId, sessionId });

      return { prevById };
    },
    onError: (err, _newTodo, context) => {
      setIsLoading(false);
      // Rollback to the previous value if mutation fails

      utils.sessions.byId.setData({ projectId, sessionId }, context?.prevById);
    },
    onSettled: () => {
      setIsLoading(false);
      utils.sessions.byId.setData(
        { projectId, sessionId },
        (oldQueryData: RouterOutput["sessions"]["byId"] | undefined) => {
          return oldQueryData
            ? {
                ...oldQueryData,
                bookmarked: !oldQueryData.bookmarked,
              }
            : undefined;
        },
      );
      void utils.sessions.all.invalidate();
      void utils.sessions.byId.invalidate();
    },
  });

  return (
    <StarToggle
      value={value}
      size={size}
      disabled={!hasAccess}
      isLoading={isLoading}
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
