import { Plus } from "@langfuse/icons";

import { Button } from "@/src/components/design-system/Button/Button";
import { DisabledActionTooltip } from "@/src/components/design-system/DisabledActionTooltip/DisabledActionTooltip";
import { GatewayGuardrailDialogController } from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/GatewayGuardrailDialogController";
import { GATEWAY_GUARDRAIL_MAX_PER_ORGANIZATION } from "@/src/features/ai-gateway/constants/gatewayGuardrails";
import { useGatewayGuardrailsTableState } from "@/src/features/ai-gateway/hooks/useGatewayGuardrailsTableState";

export type GatewayGuardrailsHeaderActionsProps = {
  organizationId: string;
};

/** "+ Add guardrail" button in the Guardrails page header, for org admins only. */
export function GatewayGuardrailsHeaderActions({
  organizationId,
}: GatewayGuardrailsHeaderActionsProps) {
  const { guardrails } = useGatewayGuardrailsTableState(organizationId);
  const isAtLimit =
    (guardrails.data?.organizationCount ?? 0) >=
    GATEWAY_GUARDRAIL_MAX_PER_ORGANIZATION;

  if (isAtLimit) {
    return (
      <DisabledActionTooltip
        label={`Organizations can have up to ${GATEWAY_GUARDRAIL_MAX_PER_ORGANIZATION} guardrails. Delete an existing guardrail or reach out to support if you need more.`}
      >
        <Button icon={Plus} text="Add guardrail" disabled />
      </DisabledActionTooltip>
    );
  }

  return (
    <GatewayGuardrailDialogController organizationId={organizationId}>
      {({ openDialog }) => {
        const handleAddClick = () => openDialog({ mode: "create" });
        return (
          <Button icon={Plus} text="Add guardrail" onClick={handleAddClick} />
        );
      }}
    </GatewayGuardrailDialogController>
  );
}
