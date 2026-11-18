import { Pencil, Trash2 } from "@langfuse/icons";

import { OverviewSelectionBar } from "@/src/components/table/OverviewSelectionBar/OverviewSelectionBar";
import { Button } from "@/src/components/ui/button";

type GatewayBudgetsSelectionBarProps = {
  selectedCount: number;
  isSaving: boolean;
  /** Set when the selection includes a row the caller can't edit. */
  disabledReason?: string;
  removeLabel: string;
  onClear: () => void;
  onEdit: () => void;
  onRemove: () => void;
};

export function GatewayBudgetsSelectionBar({
  selectedCount,
  isSaving,
  disabledReason,
  removeLabel,
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
        disabled={isSaving || disabledReason !== undefined}
        title={disabledReason}
        onClick={onEdit}
      >
        <Pencil size="base" color="default" __rawClassName="mr-2" />
        Edit budget
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isSaving || disabledReason !== undefined}
        title={disabledReason}
        onClick={onRemove}
      >
        <Trash2 size="base" color="default" __rawClassName="mr-2" />
        {removeLabel}
      </Button>
    </OverviewSelectionBar>
  );
}
