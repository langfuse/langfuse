import { useState } from "react";
import { isCloudPlan, planLabels } from "@langfuse/shared";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { env } from "@/src/env.mjs";
import { WorkspaceSwitcherPopover } from "@/src/features/app-shell/components/WorkspaceSwitcherPopover";
import { useQueryProjectOrOrganization } from "@/src/features/projects";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";

/**
 * The organization and project crumbs as one control that opens the
 * workspace switcher where the user is looking, even while the sidebar is
 * hidden.
 */
export function WorkspaceBreadcrumbSwitcher() {
  const { organization, project } = useQueryProjectOrOrganization();
  const [isOpen, setIsOpen] = useState(false);
  const capture = usePostHogClientCapture();

  return (
    <WorkspaceSwitcherPopover
      isOpen={isOpen}
      onOpenChange={(nextIsOpen) => {
        if (nextIsOpen) {
          capture("app_shell:workspace_switcher_opened", {
            source: "breadcrumb",
          });
        }
        setIsOpen(nextIsOpen);
      }}
      side="bottom"
    >
      {({ Trigger }) => (
        <Trigger asChild>
          <button
            type="button"
            className="text-primary hover:bg-accent focus-visible:ring-ring data-[state=open]:bg-accent -mx-1 flex h-6 min-w-0 items-center gap-1.5 rounded-sm px-1 text-sm leading-none outline-hidden focus-visible:ring-2"
          >
            <span
              className="max-w-48 truncate"
              title={organization?.name ?? "Organization"}
            >
              {organization?.name ?? "Organization"}
            </span>
            {organization &&
            isCloudPlan(organization.plan) &&
            organization.id !== env.NEXT_PUBLIC_DEMO_ORG_ID ? (
              <Badge
                color="filled"
                font="mono"
                size="sm"
                text={planLabels[organization.plan]}
              />
            ) : null}
            {project ? (
              <>
                <span className="text-foreground-tertiary" aria-hidden="true">
                  /
                </span>
                <span className="max-w-56 truncate" title={project.name}>
                  {project.name}
                </span>
              </>
            ) : null}
            <DropdownIndicator size="sm" nudge />
          </button>
        </Trigger>
      )}
    </WorkspaceSwitcherPopover>
  );
}
