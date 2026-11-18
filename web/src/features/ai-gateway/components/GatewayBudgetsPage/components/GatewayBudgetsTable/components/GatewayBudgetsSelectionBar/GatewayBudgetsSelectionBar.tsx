import { Pencil, Trash2 } from "@langfuse/icons";

import { OverviewSelectionBar } from "@/src/components/table/OverviewSelectionBar/OverviewSelectionBar";
import { Button } from "@/src/components/ui/button";

type GatewayBudgetsSelectionBarProps = {
  selectedCount: number;
  isSaving: boolean;
  onClear: () => void;
  onEdit: () => void;
  onRemove: () => void;
};

export function GatewayBudgetsSelectionBar({
  selectedCount,
  isSaving,
  onClear,
  onEdit,
  onRemove,
}: GatewayBudgetsSelectionBarProps) {
  return (
    <OverviewSelectionBar selectedCount={selectedCount} onClear={onClear}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isSaving}
        onClick={onEdit}
      >
        <Pencil size="base" color="default" __rawClassName="mr-2" />
        Edit budget
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isSaving}
        onClick={onRemove}
      >
        <Trash2 size="base" color="default" __rawClassName="mr-2" />
        Remove budget
      </Button>
    </OverviewSelectionBar>
  );
}
