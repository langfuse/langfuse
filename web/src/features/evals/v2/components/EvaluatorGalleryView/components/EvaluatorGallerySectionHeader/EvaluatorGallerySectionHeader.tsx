import type { ReactNode } from "react";

/**
 * Section title for the gallery. `sticky` pins it to the top of the gallery's
 * scroll pane on an opaque backdrop that fades out below it.
 */
export function EvaluatorGallerySectionHeader({
  label,
  sticky = false,
  children,
}: {
  label: string;
  sticky?: boolean;
  children?: ReactNode;
}) {
  const title = (
    <div className="flex items-center gap-2">
      <h4 className="text-foreground text-base font-bold">{label}</h4>
      {children}
    </div>
  );

  if (!sticky) return title;

  return (
    <div className="bg-modal after:from-modal sticky top-0 z-10 -mx-4 -my-2 after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-4 after:bg-linear-to-b after:to-transparent">
      <div className="bg-muted/30 px-4 py-2">{title}</div>
    </div>
  );
}
