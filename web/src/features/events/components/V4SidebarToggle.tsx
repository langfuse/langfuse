/* eslint-disable @repo/component-file-structure */
import { Switch } from "@/src/components/design-system/Switch/Switch";
import { Label } from "@/src/components/ui/label";
import { SidebarNavItem } from "@/src/components/nav/SidebarNavItem";
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

export function V4SidebarToggle({ isCollapsed }: { isCollapsed: boolean }) {
  const toggleId = useId();
  const descriptionId = useId();
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
      <SidebarNavItem.Button
        id={toggleId}
        isCollapsed={isCollapsed}
        leading={<ZapIcon size="base" />}
        label={label}
        trailing={<span className="text-xs">{isChecked ? "On" : "Off"}</span>}
        aria-label={`${label}: ${isChecked ? "On" : "Off"}`}
        aria-describedby={descriptionId}
        aria-pressed={isChecked}
        disabled={isLoading}
        onClick={() => handleSidebarToggle(!isChecked)}
      />
      <span id={descriptionId} className="sr-only">
        {description}
      </span>
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
