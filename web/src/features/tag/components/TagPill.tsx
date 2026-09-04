/**
 * Read-only tag chip: thin outlined pill, muted text. The quiet counterpart to
 * the interactive TagButton — for surfaces that display tags without editing
 * them (trace summary strip, detail headers).
 */
export function TagPill({ tag }: { tag: string }) {
  return (
    <span
      title={tag}
      className="border-border text-muted-foreground inline-flex max-w-40 items-center rounded-sm border px-1.5 text-xs leading-4"
    >
      <span className="truncate" title={tag}>
        {tag}
      </span>
    </span>
  );
}
