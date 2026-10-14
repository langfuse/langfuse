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
    <div className="bg-surface-sunken after:from-surface-sunken/80 sticky top-0 z-10 -mx-4 -mt-2 after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-3 after:bg-linear-to-b after:to-transparent">
      <div className="px-4 pt-2">{title}</div>
    </div>
  );
}
