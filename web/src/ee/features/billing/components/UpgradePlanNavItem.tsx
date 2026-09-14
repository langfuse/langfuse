import { Sparkle } from "lucide-react";

import { SidebarMenuButton, useSidebar } from "@/src/components/ui/sidebar";
import { BillingSwitchPlanDialogController } from "@/src/ee/features/billing/components/BillingSwitchPlanDialog";

export function UpgradePlanNavItem() {
  const { isMobile, setOpenMobile: setOpenMobileSidebar } = useSidebar();

  return (
    <BillingSwitchPlanDialogController source="sidebar">
      {({ openDialog, disabled }) => (
        <SidebarMenuButton
          disabled={disabled}
          tooltip="Upgrade Plan"
          onClick={() => {
            if (isMobile) {
              setOpenMobileSidebar(false);
            }
            setTimeout(() => {
              openDialog();
            }, 1);
          }}
        >
          <Sparkle />
          <span>Upgrade Plan</span>
        </SidebarMenuButton>
      )}
    </BillingSwitchPlanDialogController>
  );
}
