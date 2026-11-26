import {
  GATEWAY_GUARDRAIL_MAX_ORG_KIB,
  GATEWAY_GUARDRAIL_MAX_PER_ORGANIZATION,
  GATEWAY_GUARDRAIL_MAX_RULE_KIB,
} from "@/src/features/ai-gateway/constants/gatewayGuardrails";
import { useInAppAiAgent } from "@/src/features/in-app-agent/components/InAppAiAgentProvider";
import { useSupportDrawer } from "@/src/features/support-chat/SupportDrawerProvider";
import { useV4MigrationPanel } from "@/src/features/v4-migration/V4MigrationPanelProvider";

export type GatewayGuardrailsLimitFeedbackReason =
  | "count"
  | "rule_size"
  | "org_size";

const FEEDBACK_MESSAGES: Record<GatewayGuardrailsLimitFeedbackReason, string> =
  {
    count: `We reached the limit of ${GATEWAY_GUARDRAIL_MAX_PER_ORGANIZATION} AI Gateway guardrails and would love to share why we need more:\n\n`,
    rule_size: `We reached the ${GATEWAY_GUARDRAIL_MAX_RULE_KIB} KiB compiled size limit for an AI Gateway regex guardrail and would love to share our use case:\n\n`,
    org_size: `We reached the ${GATEWAY_GUARDRAIL_MAX_ORG_KIB} KiB combined compiled size limit for AI Gateway guardrails and would love to share why we need more capacity:\n\n`,
  };

/** Opens the support drawer prefilled as feedback about a guardrail limit. */
export function useOpenGuardrailsLimitFeedback() {
  const { openWithMode } = useSupportDrawer();
  const { setOpen: setMigrationPanelOpen } = useV4MigrationPanel();
  const { setOpen: setAiAgentOpen } = useInAppAiAgent();

  return (reason: GatewayGuardrailsLimitFeedbackReason = "count") => {
    const resolvedReason: GatewayGuardrailsLimitFeedbackReason =
      typeof reason === "string" && reason in FEEDBACK_MESSAGES
        ? reason
        : "count";
    setAiAgentOpen(false);
    setMigrationPanelOpen(false);
    openWithMode("form", {
      messageType: "Feedback",
      topic: "Platform",
      message: FEEDBACK_MESSAGES[resolvedReason],
    });
  };
}
