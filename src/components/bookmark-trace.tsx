import { StarIcon } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { api } from "@/src/utils/api";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";

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
  const hasAccess = useHasAccess({ projectId, scope: "traces:bookmark" });
  const mutBookmarkTrace = api.traces.bookmark.useMutation({
    onSuccess: () => {
      void utils.traces.invalidate();
    },
  });

  const handleBookmarkClick = () => {
    if (!hasAccess) return;
    void mutBookmarkTrace.mutateAsync({
      traceId,
      projectId,
      bookmarked: !isBookmarked,
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
          isBookmarked ? "fill-current text-yellow-500" : "text-gray-500"
        }`}
      />
    </Button>
  );
}
