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
      {/* The shell is leading-none, so clipping vertically would cut descenders. */}
      <span
        className="text-foreground min-w-0 overflow-x-clip overflow-y-visible py-0.5 text-ellipsis whitespace-nowrap"
        title={value}
      >
        {value}
      </span>
    </BadgeShell>
  );
}
