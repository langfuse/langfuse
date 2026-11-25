import { GATEWAY_GUARDRAIL_MAX_PER_ORGANIZATION } from "@/src/features/ai-gateway/constants/gatewayGuardrails";
import { useInAppAiAgent } from "@/src/features/in-app-agent/components/InAppAiAgentProvider";
import { useSupportDrawer } from "@/src/features/support-chat/SupportDrawerProvider";
import { useV4MigrationPanel } from "@/src/features/v4-migration/V4MigrationPanelProvider";

/** Opens the support drawer prefilled as feedback about the per-org guardrail limit. */
export function useOpenGuardrailsLimitFeedback() {
  const { openWithMode } = useSupportDrawer();
  const { setOpen: setMigrationPanelOpen } = useV4MigrationPanel();
  const { setOpen: setAiAgentOpen } = useInAppAiAgent();

  return () => {
    setAiAgentOpen(false);
    setMigrationPanelOpen(false);
    openWithMode("form", {
      messageType: "Feedback",
      topic: "Platform",
      message: `We reached the limit of ${GATEWAY_GUARDRAIL_MAX_PER_ORGANIZATION} AI Gateway guardrails and would love to share why we need more:\n\n`,
    });
  };
}
