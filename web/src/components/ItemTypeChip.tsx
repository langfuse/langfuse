import { Badge } from "@/src/components/ui/badge";
import {
  getItemTypeLabels,
  type LangfuseItemType,
} from "@/src/components/ItemBadge";

/**
 * Quiet chip naming an item type, for page and peek headers: no fill and muted
 * text so it doesn't compete with the title next to it. Carries no icon because
 * the label already names the type.
 */
export function ItemTypeChip({ type }: { type: LangfuseItemType }) {
  const { label, displayLabel } = getItemTypeLabels(type);

  return (
    <Badge
      variant="outline"
      title={label}
      className="text-muted-foreground border-border flex max-w-fit items-center overflow-hidden border bg-transparent px-1 whitespace-nowrap"
    >
      <span className="truncate" title={displayLabel}>
        {displayLabel}
      </span>
    </Badge>
  );
}
