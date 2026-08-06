import { CopyIcon, Share2, Star } from "lucide-react";
import { type ReactNode } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/src/components/ui/dropdown-menu";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { useCopyToClipboard } from "@/src/hooks/useCopyToClipboard";
import { api } from "@/src/utils/api";

export function ModernSessionHeaderActionsController({
  projectId,
  sessionId,
  bookmarked,
  isPublic,
  children,
}: {
  projectId: string;
  sessionId: string;
  bookmarked: boolean;
  isPublic: boolean;
  children: ReactNode;
}) {
  const capture = usePostHogClientCapture();
  const { copy } = useCopyToClipboard();
  const utils = api.useUtils();
  const hasBookmarkAccess = useHasProjectAccess({
    projectId,
    scope: "objects:bookmark",
  });
  const hasPublishAccess = useHasProjectAccess({
    projectId,
    scope: "objects:publish",
  });
  const bookmarkMutation = api.sessions.bookmark.useMutation({
    onSuccess: () => utils.sessions.invalidate(),
  });
  const publishMutation = api.sessions.publish.useMutation({
    onSuccess: () => utils.sessions.invalidate(),
  });

  return (
    <DropdownMenu>
      {children}
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          disabled={!hasBookmarkAccess || bookmarkMutation.isPending}
          onClick={() => {
            capture("table:bookmark_button_click", {
              table: "sessions",
              id: sessionId,
              value: !bookmarked,
            });
            bookmarkMutation.mutate({
              projectId,
              sessionId,
              bookmarked: !bookmarked,
            });
          }}
        >
          <Star
            className="mr-2 h-3.5 w-3.5"
            fill={bookmarked ? "currentColor" : "none"}
          />
          {bookmarked ? "Remove from favourites" : "Add to favourites"}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!hasPublishAccess || publishMutation.isPending}
          onClick={() => {
            capture("session_detail:publish_button_click");
            publishMutation.mutate({
              projectId,
              sessionId,
              public: !isPublic,
            });
          }}
        >
          <Share2 className="mr-2 h-3.5 w-3.5" />
          {isPublic ? "Unshare (make private)" : "Share (make public)"}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={async () => {
            capture("session_detail:copy_session_id_click");
            await copy(sessionId);
          }}
        >
          <CopyIcon className="mr-2 h-3.5 w-3.5" />
          Copy session ID
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
