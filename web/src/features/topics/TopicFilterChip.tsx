import { BadgeShell } from "@/src/components/design-system/Badge/Badge";
import { type topicFilterParts } from "./topic-maps";

/** A filter as a chip: muted column and operator, then the value. */
export function TopicFilterChip({
  column,
  operator,
  value,
}: ReturnType<typeof topicFilterParts>[number]) {
  return (
    <BadgeShell color="filled" size="lg">
      <span className="text-muted-foreground shrink-0">
        {column} {operator}
      </span>
      <span className="text-foreground truncate" title={value}>
        {value}
      </span>
    </BadgeShell>
  );
}
