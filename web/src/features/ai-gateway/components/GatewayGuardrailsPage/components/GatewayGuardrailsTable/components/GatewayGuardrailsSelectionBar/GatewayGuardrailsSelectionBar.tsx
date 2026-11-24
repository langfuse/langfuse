import { Trash2, Users } from "@langfuse/icons";

import { OverviewSelectionBar } from "@/src/components/table/OverviewSelectionBar/OverviewSelectionBar";
import { Button } from "@/src/components/design-system/Button/Button";

export type GatewayGuardrailsSelectionBarProps = {
  selectedCount: number;
  isBusy: boolean;
  onClear: () => void;
  onSetAppliesTo: () => void;
  onDelete: () => void;
};

export function GatewayGuardrailsSelectionBar({
  selectedCount,
  isBusy,
  onClear,
  onSetAppliesTo,
  onDelete,
}: GatewayGuardrailsSelectionBarProps) {
  return (
    <OverviewSelectionBar selectedCount={selectedCount} onClear={onClear}>
      <Button
        variant="outline"
        size="sm"
        icon={Users}
        text="Set applies to"
        disabled={isBusy}
        onClick={onSetAppliesTo}
      />
      <Button
        variant="outline"
        size="sm"
        icon={Trash2}
        text="Delete"
        disabled={isBusy}
        onClick={onDelete}
      />
    </OverviewSelectionBar>
  );
}
