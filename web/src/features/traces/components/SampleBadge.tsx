import { BadgeShell } from "@/src/components/design-system/Badge/Badge";

/** Marks the observation that is the sample. */
export function SampleBadge() {
  return (
    <span className="flex shrink-0">
      <BadgeShell color="blue" size="sm">
        {/* The dot is out of flow, so the badge's baseline is its text's. */}
        <span className="relative pl-2.5 whitespace-nowrap uppercase">
          <span className="absolute top-1/2 left-0 size-1.5 -translate-y-1/2 rounded-full bg-current" />
          Will be evaluated
        </span>
      </BadgeShell>
    </span>
  );
}
