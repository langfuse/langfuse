import { InternalFeatureBadge } from "@/src/features/feature-flags";
import { useInAppAiAgent } from "@/src/features/in-app-agent";
import { useSupportDrawer } from "@/src/features/support-chat";
import { useV4MigrationPanel } from "@/src/features/v4-migration/V4MigrationPanelProvider";
import { useTracelift } from "./TraceliftContext";
import { TraceliftNotificationButton } from "./TraceliftNotificationButton";

export function TraceliftBadgeContent() {
  const { setOpen } = useTracelift();
  const { setOpen: setSupportOpen } = useSupportDrawer();
  const { setOpen: setMigrationOpen } = useV4MigrationPanel();
  const { setOpen: setAssistantOpen } = useInAppAiAgent();

  return (
    <span className="inline-flex items-center gap-1.5">
      <TraceliftNotificationButton
        onClick={() => {
          setSupportOpen(false);
          setMigrationOpen(false);
          setAssistantOpen(false);
          setOpen(true);
        }}
      />
      <InternalFeatureBadge />
    </span>
  );
}
