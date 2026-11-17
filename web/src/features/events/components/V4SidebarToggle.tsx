/* eslint-disable @repo/component-file-structure, @typescript-eslint/no-deprecated -- Legacy UI usage retained during migration to design-system components. */
import { Switch } from "@/src/components/design-system/Switch/Switch";
import { Label } from "@/src/components/ui/label";
import { SidebarMenuButton } from "@/src/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { useReadPath } from "@/src/features/events/hooks/useReadPath";
import { useV4PreviewToggle } from "@/src/features/events/hooks/useV4PreviewToggle";
import { V4IntroDialog } from "@/src/features/events/components/V4IntroDialog";
import { ZapIcon } from "@langfuse/icons";
import { useId } from "react";
import { useRouter } from "next/router";

import {
  V4_PREVIEW_LABEL,
  V4_PREVIEW_DESCRIPTION,
} from "@/src/features/events/lib/v4PreviewLabel";

export function V4SidebarToggle() {
  const { canToggleV4 } = useReadPath();
  // A locked toggle is only shown in the sidebar for one-way recovery.
  const label = canToggleV4 ? V4_PREVIEW_LABEL : "Enable V4";
  const description = canToggleV4
    ? V4_PREVIEW_DESCRIPTION
    : "Your account is using the legacy experience due to a configuration issue. Enable V4 to return to the default experience. This is a personal setting across all your projects.";
  const {
    isChecked,
    isLoading,
    handleToggle,
    showIntroDialog,
    confirmIntroDialog,
    dismissIntroDialog,
  } = useV4PreviewToggle("sidebar");

  const handleSidebarToggle = (enabled: boolean) => {
    if (canToggleV4 || enabled) handleToggle(enabled);
  };

  return (
    <>
      <SidebarMenuButton
        asChild
        className="justify-between gap-1.5 group-data-[collapsible=icon]:justify-center"
      >
        <div>
          <div className="flex min-w-0 flex-1 items-center gap-2 group-data-[collapsible=icon]:hidden">
            <ZapIcon size="base" />
            <Label
              htmlFor="v4-beta-toggle"
              className="block min-w-0 flex-1 cursor-pointer truncate text-sm font-normal"
              title={label}
            >
              {label}
            </Label>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex shrink-0">
                <Switch
                  id="v4-beta-toggle"
                  size="sm"
                  checked={isChecked}
                  onCheckedChange={handleSidebarToggle}
                  disabled={isLoading}
                  aria-label={
                    canToggleV4 ? `Toggle ${V4_PREVIEW_LABEL}` : "Enable V4"
                  }
                  aria-describedby="v4-preview-sidebar-description"
                />
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-xs text-xs">
              {description}
            </TooltipContent>
          </Tooltip>
          <span id="v4-preview-sidebar-description" className="sr-only">
            {description}
          </span>
        </div>
      </SidebarMenuButton>
      <V4IntroDialog
        open={showIntroDialog}
        onConfirm={confirmIntroDialog}
        onDismiss={dismissIntroDialog}
      />
    </>
  );
}

// Panel-row variant of the toggle, rendered inside the v4-migration panel's
// "Want to review first?" section. Toggling in either direction jumps to the
// project's traces page (the panel stays open across the navigation) so users
// see the switched experience immediately.
export function V4PreviewToggleRow({ projectId }: { projectId?: string }) {
  const router = useRouter();
  // Panel and modal can render this row at the same time, so ids must be
  // instance-scoped for the label/description associations to hold.
  const toggleId = useId();
  const descriptionId = useId();
  const {
    isChecked,
    isLoading,
    handleToggle,
    showIntroDialog,
    confirmIntroDialog,
    dismissIntroDialog,
  } = useV4PreviewToggle("migration_panel");

  const handlePanelToggle = (enabled: boolean) => {
    handleToggle(
      enabled,
      projectId ? () => router.push(`/project/${projectId}/traces`) : undefined,
    );
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground shrink-0 text-sm">V3</span>
        <Switch
          id={toggleId}
          size="sm"
          checked={isChecked}
          onCheckedChange={handlePanelToggle}
          disabled={isLoading}
          aria-label={`Toggle ${V4_PREVIEW_LABEL}`}
          aria-describedby={descriptionId}
        />
        <Label
          htmlFor={toggleId}
          className="text-muted-foreground block min-w-0 cursor-pointer truncate text-sm font-normal"
          title="V4"
        >
          V4
        </Label>
        <span id={descriptionId} className="sr-only">
          {V4_PREVIEW_DESCRIPTION}
        </span>
      </div>
      <V4IntroDialog
        open={showIntroDialog}
        onConfirm={confirmIntroDialog}
        onDismiss={dismissIntroDialog}
      />
    </>
  );
}
