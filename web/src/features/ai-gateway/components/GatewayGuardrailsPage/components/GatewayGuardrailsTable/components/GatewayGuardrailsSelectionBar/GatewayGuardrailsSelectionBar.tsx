import { Trash2 } from "@langfuse/icons";

import { OverviewSelectionBar } from "@/src/components/table/OverviewSelectionBar/OverviewSelectionBar";
import { Button } from "@/src/components/design-system/Button/Button";

export type GatewayGuardrailsSelectionBarProps = {
  selectedCount: number;
  isDeleting: boolean;
  onClear: () => void;
  onDelete: () => void;
};

export function GatewayGuardrailsSelectionBar({
  selectedCount,
  isDeleting,
  onClear,
  onDelete,
}: GatewayGuardrailsSelectionBarProps) {
  return (
    <OverviewSelectionBar selectedCount={selectedCount} onClear={onClear}>
      <Button
        variant="outline"
        size="sm"
        icon={Trash2}
        text="Delete"
        disabled={isDeleting}
        onClick={onDelete}
      />
    </OverviewSelectionBar>
  );
}
