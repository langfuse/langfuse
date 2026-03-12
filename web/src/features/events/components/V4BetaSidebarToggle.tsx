import { Switch } from "@/src/components/ui/switch";
import { Label } from "@/src/components/ui/label";
import { SidebarMenuButton } from "@/src/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
import { V4BetaIntroDialog } from "@/src/features/events/components/V4BetaIntroDialog";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { ZapIcon } from "lucide-react";

const PREVIEW_FAST_DESCRIPTION =
  "Get a more performant Langfuse experience. Upgrade SDKs to the latest major for real-time data. This is a personal setting.";
const PREVIEW_FAST_DESCRIPTION_ID = "preview-fast-toggle-description";

export function V4BetaSidebarToggle() {
  const {
    isBetaEnabled,
    setBetaEnabled,
    enableWithIntro,
    showIntroDialog,
    confirmIntroDialog,
    isLoading,
  } = useV4Beta();
  const capture = usePostHogClientCapture();

  const handleToggle = (enabled: boolean) => {
    if (enabled) {
      enableWithIntro({
        onSuccess: () => {
          capture("sidebar:v4_beta_toggled", { enabled: true });
        },
      });
    } else {
      setBetaEnabled(false, {
        onSuccess: () => {
          capture("sidebar:v4_beta_toggled", { enabled: false });
        },
      });
    }
  };

  return (
    <>
      <SidebarMenuButton
        asChild
        className="justify-between gap-1.5 group-data-[collapsible=icon]:justify-center"
      >
        <div>
          <div className="flex min-w-0 flex-1 items-center gap-2 group-data-[collapsible=icon]:hidden">
            <ZapIcon className="h-4 w-4 shrink-0" />
            <Label
              htmlFor="v4-beta-toggle"
              className="block min-w-0 flex-1 cursor-pointer truncate text-sm font-normal"
            >
              Fast (Preview)
            </Label>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex shrink-0">
                <Switch
                  id="v4-beta-toggle"
                  size="sm"
                  checked={isBetaEnabled}
                  onCheckedChange={handleToggle}
                  disabled={isLoading}
                  className="shrink-0"
                  aria-label="Toggle Preview (fast)"
                  aria-describedby={PREVIEW_FAST_DESCRIPTION_ID}
                />
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-xs text-xs">
              {PREVIEW_FAST_DESCRIPTION}
            </TooltipContent>
          </Tooltip>
          <span id={PREVIEW_FAST_DESCRIPTION_ID} className="sr-only">
            {PREVIEW_FAST_DESCRIPTION}
          </span>
        </div>
      </SidebarMenuButton>
      <V4BetaIntroDialog
        open={showIntroDialog}
        onConfirm={confirmIntroDialog}
      />
    </>
  );
}
