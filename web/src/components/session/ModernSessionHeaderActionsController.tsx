import { CopyIcon, Share2 } from "lucide-react";
import { type ReactNode } from "react";

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/src/components/ui/dropdown-menu";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { useCopyToClipboard } from "@/src/hooks/useCopyToClipboard";
import { api } from "@/src/utils/api";
import { useTranslations } from "next-intl";

export function ModernSessionHeaderActionsController({
  projectId,
  sessionId,
  isPublic,
  showCorrections,
  showInlineToolCalls,
  showSystemPrompt,
  onShowCorrectionsChange,
  onShowInlineToolCallsChange,
  onShowSystemPromptChange,
  children,
}: {
  projectId: string;
  sessionId: string;
  isPublic: boolean;
  showCorrections: boolean;
  showInlineToolCalls: boolean;
  showSystemPrompt: boolean;
  onShowCorrectionsChange: (isEnabled: boolean) => void;
  onShowInlineToolCallsChange: (isEnabled: boolean) => void;
  onShowSystemPromptChange: (isEnabled: boolean) => void;
  children: ReactNode;
}) {
  const t = useTranslations("coreDetails.sessions.headerActions");
  const capture = usePostHogClientCapture();
  const { copy } = useCopyToClipboard();
  const utils = api.useUtils();
  const hasPublishAccess = useHasProjectAccess({
    projectId,
    scope: "objects:publish",
  });
  const publishMutation = api.sessions.publish.useMutation({
    onSuccess: () => utils.sessions.invalidate(),
  });

  return (
    <DropdownMenu>
      {children}
      <DropdownMenuContent align="end">
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
          {isPublic ? t("unshare") : t("share")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={async () => {
            capture("session_detail:copy_session_id_click");
            await copy(sessionId);
          }}
        >
          <CopyIcon className="mr-2 h-3.5 w-3.5" />
          {t("copySessionId")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>{t("display")}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuCheckboxItem
              checked={showCorrections}
              onClick={(event) => {
                event.preventDefault();
                onShowCorrectionsChange(!showCorrections);
              }}
            >
              {t("showCorrections")}
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={showInlineToolCalls}
              onClick={(event) => {
                event.preventDefault();
                onShowInlineToolCallsChange(!showInlineToolCalls);
              }}
            >
              {t("showToolCalls")}
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={showSystemPrompt}
              onClick={(event) => {
                event.preventDefault();
                onShowSystemPromptChange(!showSystemPrompt);
              }}
            >
              {t("showSystemPrompt")}
            </DropdownMenuCheckboxItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
