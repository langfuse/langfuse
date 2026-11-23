import { useInAppAiAgent } from "@/src/features/in-app-agent/components/InAppAiAgentProvider";
import { useSupportDrawer } from "@/src/features/support-chat/SupportDrawerProvider";
import { useV4MigrationPanel } from "@/src/features/v4-migration/V4MigrationPanelProvider";
import { useTopicsCapture } from "./useTopicsCapture";

/** Opens the support form as Topics feedback, closing the other right-side panels like the Support button does. */
export function useOpenTopicsFeedback() {
  const { openWithMode } = useSupportDrawer();
  const { setOpen: setMigrationPanelOpen } = useV4MigrationPanel();
  const { setOpen: setAiAgentOpen } = useInAppAiAgent();
  const capture = useTopicsCapture();
  return () => {
    capture("topics:feedback_open");
    setAiAgentOpen(false);
    setMigrationPanelOpen(false);
    openWithMode("form", {
      messageType: "Feedback",
      topic: "Observability",
      message:
        "I have some feedback to share related to the new Topics feature.\n\n",
    });
  };
}
