"use client";

import * as React from "react";
import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { isCloudPlan, planLabels, type Plan } from "@langfuse/shared";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { env } from "@/src/env.mjs";
import type { OrganizationDropdownMenu } from "@/src/components/OrganizationDropdownMenu/OrganizationDropdownMenu";
import { nextCompactPlanBadge } from "./compactPlanBadge";
import { ControlledOrganizationDropdownMenu } from "@/src/components/OrganizationDropdownMenu/ControlledOrganizationDropdownMenu";
import { useOrgProjectSwitchPaths } from "@/src/features/projects/hooks";

type OrganizationOption = Extract<
  React.ComponentProps<typeof OrganizationDropdownMenu>,
  { state: "loaded" }
>["organizations"][number];

/** Plans whose badge has a shorter form for when the full one would truncate the org name. */
const SHORT_PLAN_LABELS: Partial<Record<Plan, string>> = {
  "cloud:enterprise": "ENT",
  "cloud:enterprise-trial": "ENT TRIAL",
};

/**
 * Switches the plan badge to its short label while the full one would
 * truncate the org name, and back once there is room for it again.
 */
function useCompactPlanBadge(hasShortLabel: boolean, name: string) {
  const nameRef = React.useRef<HTMLSpanElement>(null);
  const badgeRef = React.useRef<HTMLSpanElement>(null);
  const chevronRef = React.useRef<HTMLSpanElement>(null);
  const fullBadgeWidth = React.useRef(0);
  const compactRef = React.useRef(false);
  const [compact, setCompact] = React.useState(false);

  React.useLayoutEffect(() => {
    const nameEl = nameRef.current;
    const badgeEl = badgeRef.current;
    const chevronEl = chevronRef.current;
    if (!hasShortLabel || !nameEl || !badgeEl || !chevronEl) {
      if (compactRef.current) {
        compactRef.current = false;
        setCompact(false);
      }
      return;
    }
    const update = () => {
      const parent = nameEl.parentElement;
      const gapPx = parent
        ? Number.parseFloat(getComputedStyle(parent).columnGap) || 0
        : 0;
      const freeSpace =
        chevronEl.getBoundingClientRect().left -
        badgeEl.getBoundingClientRect().right;
      const next = nextCompactPlanBadge({
        compact: compactRef.current,
        nameScrollWidth: nameEl.scrollWidth,
        nameClientWidth: nameEl.clientWidth,
        freeSpace,
        fullBadgeWidth: fullBadgeWidth.current,
        currentBadgeWidth: badgeEl.offsetWidth,
        gapPx,
      });
      if (next === compactRef.current) return;
      // Record the full badge before the short label replaces it.
      if (!compactRef.current) fullBadgeWidth.current = badgeEl.offsetWidth;
      compactRef.current = next;
      setCompact(next);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(nameEl);
    if (nameEl.parentElement) observer.observe(nameEl.parentElement);
    return () => observer.disconnect();
  }, [hasShortLabel, name]);

  return { nameRef, badgeRef, chevronRef, compact };
}

function SidebarOrganizationSwitcher({
  organization,
  organizations,
  canCreateOrganizations,
  open,
  onOpenChange,
}: {
  organization: { id: string; name: string };
  organizations: OrganizationOption[] | null;
  canCreateOrganizations: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { getOrgPath } = useOrgProjectSwitchPaths();
  const plan = organizations?.find((org) => org.id === organization.id)?.plan;
  const showPlan =
    plan !== undefined &&
    isCloudPlan(plan) &&
    organization.id !== env.NEXT_PUBLIC_DEMO_ORG_ID;
  const shortPlanLabel = plan ? SHORT_PLAN_LABELS[plan] : undefined;
  const { nameRef, badgeRef, chevronRef, compact } = useCompactPlanBadge(
    shortPlanLabel !== undefined,
    organization.name,
  );

  return (
    <div className="flex min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
      <ControlledOrganizationDropdownMenu
        {...(organizations
          ? { state: "loaded", organizations }
          : { state: "loading" })}
        canCreateOrganizations={canCreateOrganizations}
        getOrgPath={getOrgPath}
        currentOrganizationId={organization.id}
        open={open}
        onOpenChange={onOpenChange}
      >
        {({ getTriggerProps }) => (
          <button
            type="button"
            className="text-primary -ml-3.5 flex h-6 min-w-0 flex-1 items-center gap-1.5 py-0 pr-2 pl-3 text-sm"
            {...getTriggerProps()}
          >
            <span
              ref={nameRef}
              className="ph-no-capture min-w-0 truncate py-0.5 leading-none font-medium"
              title={organization.name}
            >
              {organization.name}
            </span>
            {plan && showPlan && (
              <span ref={badgeRef} className="flex shrink-0">
                <Badge
                  color="filled"
                  size="sm"
                  text={
                    compact && shortPlanLabel
                      ? shortPlanLabel
                      : planLabels[plan].toUpperCase()
                  }
                />
              </span>
            )}
            <span ref={chevronRef} className="ml-auto flex shrink-0">
              <DropdownIndicator direction="up-down" size="sm" color="muted" />
            </span>
          </button>
        )}
      </ControlledOrganizationDropdownMenu>
    </div>
  );
}

export const AppSidebar = {
  OrganizationSwitcher: SidebarOrganizationSwitcher,
};
