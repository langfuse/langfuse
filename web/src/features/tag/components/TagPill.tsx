import { ModernSessionHeaderPill } from "@/src/features/sessions/ModernSessionHeaderPill";

/**
 * Read-only tag chip for surfaces that display tags without editing them
 * (trace summary strip, detail headers). Renders through the session
 * header's pill primitive so trace and session chips share one style.
 */
export function TagPill({ tag }: { tag: string }) {
  return (
    <ModernSessionHeaderPill variant="display" title={tag}>
      <span className="max-w-40 truncate" title={tag}>
        {tag}
      </span>
    </ModernSessionHeaderPill>
  );
}
