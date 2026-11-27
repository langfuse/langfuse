import { BadgeShell } from "@/src/components/design-system/Badge/Badge";

/** Marks the tree row that is the sample. */
export function SampleBadge() {
  return (
    <span className="flex shrink-0">
      <BadgeShell color="blue" size="sm">
        <span className="size-1.5 shrink-0 rounded-full bg-current" />
        <span className="whitespace-nowrap uppercase">Sample</span>
      </BadgeShell>
    </span>
  );
}
