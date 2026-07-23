import { ChevronRight } from "lucide-react";
import { useV4MigrationPanel } from "@/src/features/v4-migration/V4MigrationPanelProvider";
import { useV4UpgradeUiEnabled } from "@/src/features/v4-migration/useV4UpgradeUiEnabled";
import { useSupportDrawer } from "@/src/features/support-chat/SupportDrawerProvider";
import { useInAppAiAgent } from "@/src/ee/features/in-app-agent/components/InAppAiAgentProvider";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useQueryProject } from "@/src/features/projects/hooks";
import { useProjectSdkVersionInfo } from "@/src/features/sdk-version/hooks/useProjectSdkVersionInfo";
import { getV4MigrationSdkStatus } from "@/src/features/v4-migration/sdkVersionStatus";

export function V4MigrationDelayBadge() {
  const v4UpgradeUiEnabled = useV4UpgradeUiEnabled();
  const { openForProject } = useV4MigrationPanel();
  const { setOpen: setSupportDrawerOpen } = useSupportDrawer();
  const { setOpen: setAiAgentOpen } = useInAppAiAgent();
  const { project } = useQueryProject();
  const capture = usePostHogClientCapture();
  const sdkVersionState = useProjectSdkVersionInfo({
    projectId: project?.id ?? "",
    enabled: v4UpgradeUiEnabled && Boolean(project),
    refreshMode: "always",
  });
  const sdkStatus = getV4MigrationSdkStatus(sdkVersionState);

  if (!v4UpgradeUiEnabled || !project || sdkStatus !== "legacy") {
    return null;
  }

  const handleClick = () => {
    capture("v4_migration:delay_badge_clicked");
    setAiAgentOpen(false);
    setSupportDrawerOpen(false);
    openForProject({ id: project.id, name: project.name });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="group ring-input hover:bg-muted/50 hover:text-foreground inline-flex w-fit flex-none shrink-0 items-center gap-1.5 rounded-full bg-transparent px-2 py-0.5 text-xs font-bold whitespace-nowrap ring"
    >
      <span
        aria-hidden
        className="size-1.75 shrink-0 rounded-full bg-orange-400 dark:bg-orange-400"
      ></span>
      <span className="flex items-center">
        New data in ~15 min
        <span className="flex max-w-0 items-center overflow-hidden transition-[max-width] duration-300 ease-out group-hover:max-w-96">
          <span className="whitespace-nowrap">
            .&nbsp;Update your SDK for real-time data.
          </span>
        </span>
        <ChevronRight className="ml-1 h-3 w-3 shrink-0" />
      </span>
    </button>
  );
}
