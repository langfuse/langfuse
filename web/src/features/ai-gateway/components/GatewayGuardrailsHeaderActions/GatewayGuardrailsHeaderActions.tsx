import { Plus } from "@langfuse/icons";

import { Button } from "@/src/components/design-system/Button/Button";
import { GatewayGuardrailDialogController } from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/GatewayGuardrailDialogController";

export type GatewayGuardrailsHeaderActionsProps = {
  organizationId: string;
};

/** "+ Add guardrail" button in the Guardrails page header, for org admins only. */
export function GatewayGuardrailsHeaderActions({
  organizationId,
}: GatewayGuardrailsHeaderActionsProps) {
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
