import { StarIcon } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { api } from "@/src/utils/api";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";

export function BookmarkTrace({
                                  traceId,
                                  projectId,
                                  isBookmarked,
                              }: {
    traceId: string;
    projectId: string;
    isBookmarked: boolean;
}) {
    const utils = api.useUtils();

    const hasAccess = useHasAccess({ projectId, scope: "traces:bookmark" });

    const mutBookmarkTrace = api.traces.bookmark.useMutation({
        onSuccess: () => {
            void utils.traces.invalidate();
        },
    });

    if (!hasAccess) {
        return null;
    }

    const handleBookmarkClick = () => {
        void mutBookmarkTrace.mutateAsync({
            traceId,
            projectId,
            bookmarked: !isBookmarked,
        });
    };

    return (
        <Button
            variant="ghost"
            size="xs"
            onClick={handleBookmarkClick}

        >
            <StarIcon
                className={`h-4 w-4 ${isBookmarked ? "text-yellow-500 fill-current" : ""}`}
            />
        </Button>
    );
}
