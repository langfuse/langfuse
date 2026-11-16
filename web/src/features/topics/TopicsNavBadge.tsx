import { Badge } from "@/src/components/design-system/Badge/Badge";

/** Sidebar count of topics the latest map runs added since the viewer last opened Topics. */
export function TopicsNavBadge({
  count,
  description,
}: {
  count: number;
  description: string;
}) {
  return (
    // The description can name a project-defined facet.
    <span className="ph-no-capture ml-auto flex shrink-0">
      <span className="sr-only">{description}</span>
      <Badge
        aria-hidden
        size="sm"
        color="info"
        text={String(count)}
        title={description}
      />
    </span>
  );
}
