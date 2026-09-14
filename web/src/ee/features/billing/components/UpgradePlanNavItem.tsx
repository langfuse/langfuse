import { Sparkle } from "lucide-react";

import { SidebarMenuButton } from "@/src/components/ui/sidebar";
import { BillingSwitchPlanDialogController } from "@/src/ee/features/billing/components/BillingSwitchPlanDialog";

export function UpgradePlanNavItem() {
  // Do not close the mobile sidebar Sheet before opening. This item is a
  // descendant of SheetContent; unmounting the Sheet would take the dialog
  // with it. The dialog portals into the modal layer above the Sheet.
  return (
    <BillingSwitchPlanDialogController source="sidebar">
      {({ openDialog, disabled }) => (
        <SidebarMenuButton
          disabled={disabled}
          tooltip="Upgrade Plan"
          onClick={openDialog}
        >
          <Sparkle />
          <span>Upgrade Plan</span>
        </SidebarMenuButton>
      )}
    </BillingSwitchPlanDialogController>
  );
}
