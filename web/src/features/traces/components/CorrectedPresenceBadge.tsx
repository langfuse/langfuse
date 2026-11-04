import { BadgeShell } from "@/src/components/design-system/Badge/Badge";

/**
 * Presence-only chip for a CORRECTION score. Same BadgeShell density as
 * ScoreBadge; label + trailing tick (ScoreValue adornment side). Not an editor.
 */
export function CorrectedPresenceBadge({
  onClick,
  color = "filled",
}: {
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  /** Match ScoreBadge on muted/selected tree rows. */
  color?: "filled" | "filledOnMuted";
}) {
  const label = (
    <>
      <span className="text-muted-foreground truncate py-0.5" title="Corrected">
        Corrected
      </span>
      <span className="text-foreground py-0.5" aria-hidden>
        ✓
      </span>
    </>
  );

  if (onClick) {
    return (
      <BadgeShell color={color} size="md" asChild interactive>
        <button
          type="button"
          onClick={onClick}
          title="Correction"
          aria-label="Correction"
          className="inline-flex max-w-full min-w-0 items-center gap-1 font-mono"
        >
          {label}
        </button>
      </BadgeShell>
    );
  }

  return (
    <BadgeShell color={color} size="md">
      <span className="inline-flex max-w-full min-w-0 items-center gap-1 font-mono">
        {label}
      </span>
    </BadgeShell>
  );
}
