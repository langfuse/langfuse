import { StarIcon } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { api } from "@/src/utils/api";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { useEffect, useState } from "react";

export function BookmarkTrace({
  traceId,
  projectId,
  isBookmarked,
  size = "sm",
}: {
  traceId: string;
  projectId: string;
  isBookmarked: boolean;
  size?: "sm" | "xs";
}) {
  const utils = api.useUtils();
  const [cacheIsBookmarked, setCacheIsBookmarked] = useState<boolean | null>(
    null,
  );
  const localIsBookmarked = cacheIsBookmarked ?? isBookmarked;
  const hasAccess = useHasAccess({ projectId, scope: "traces:bookmark" });
  const mutBookmarkTrace = api.traces.bookmark.useMutation({
    onSuccess: () => {
      setCacheIsBookmarked(!localIsBookmarked);
      void utils.traces.invalidate();
    },
  });

  useEffect(() => {
    setCacheIsBookmarked(null);
  }, [isBookmarked]);

  const handleBookmarkClick = () => {
    if (!hasAccess) return;
    void mutBookmarkTrace.mutateAsync({
      traceId,
      projectId,
      bookmarked: !localIsBookmarked,
    });
  };

  return (
    <Button
      variant="ghost"
      size={size}
      onClick={handleBookmarkClick}
      disabled={!hasAccess}
      loading={mutBookmarkTrace.isLoading}
    >
      <StarIcon
        className={`h-4 w-4 ${
          localIsBookmarked ? "fill-current text-yellow-500" : "text-gray-500"
        }`}
      />
    </Button>
  );
}
