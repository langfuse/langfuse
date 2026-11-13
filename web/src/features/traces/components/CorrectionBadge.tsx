import { BadgeShell } from "@/src/components/design-system/Badge/Badge";

/**
 * Presence-only chip for a CORRECTION score. Same BadgeShell density as
 * ScoreBadge; label + trailing tick (ScoreValue adornment side). Not an editor.
 */
export function CorrectionBadge() {
  return (
    <BadgeShell color="filled" size="md">
      <span className="inline-flex max-w-full min-w-0 items-center gap-1 font-mono">
        <span
          className="text-muted-foreground truncate py-0.5"
          title="Corrected"
        >
          Corrected
        </span>
        <span className="text-foreground py-0.5" aria-hidden>
          ✓
        </span>
      </span>
    </BadgeShell>
  );
}
