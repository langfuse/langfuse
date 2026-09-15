import Link from "next/link";
import { Sparkle } from "lucide-react";

import { SidebarMenuButton } from "@/src/components/ui/sidebar";
import { billingPlanDialogHref } from "@/src/ee/features/billing/utils/planDialogQuery";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";

export function UpgradePlanNavItem() {
  const { organization } = useQueryProjectOrOrganization();
  const href = organization
    ? billingPlanDialogHref(organization.id)
    : undefined;

  if (!href) {
    return (
      <SidebarMenuButton disabled tooltip="Upgrade Plan">
        <Sparkle />
        <span>Upgrade Plan</span>
      </SidebarMenuButton>
    );
  }

  return (
    <SidebarMenuButton asChild tooltip="Upgrade Plan">
      <Link href={href}>
        <Sparkle />
        <span>Upgrade Plan</span>
      </Link>
    </SidebarMenuButton>
  );
}
