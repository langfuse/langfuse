import { StarIcon } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { useEffect, useState } from "react";
import { api } from "@/src/utils/api";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";

export function StarToggle({
  value,
  disabled = false,
  onClick,
  size = "sm",
}: {
  value: boolean;
  disabled?: boolean;
  onClick: (value: boolean) => Promise<unknown>;
  size?: "sm" | "xs";
}) {
  const [cachedValue, setCachedValue] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const optimisticValue = cachedValue ?? value;

  useEffect(() => {
    setCachedValue(null);
  }, [value]);

  const handleBookmarkClick = async () => {
    if (disabled) return;
    setLoading(true);
    setCachedValue(!optimisticValue);
    await onClick(!optimisticValue);
    setLoading(false);
  };

  return (
    <Button
      variant="ghost"
      size={size}
      onClick={() => void handleBookmarkClick()}
      disabled={disabled}
      loading={loading}
    >
      <StarIcon
        className={`h-4 w-4 ${
          optimisticValue ? "fill-current text-yellow-500" : "text-gray-500"
        }`}
      />
    </Button>
  );
}

export function StarTraceToggle({
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
  const mutBookmarkTrace = api.traces.bookmark.useMutation({
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
    />
  );
}
