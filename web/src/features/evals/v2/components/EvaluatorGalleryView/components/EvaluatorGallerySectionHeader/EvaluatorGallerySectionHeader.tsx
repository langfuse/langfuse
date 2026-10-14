import type { ReactNode } from "react";

/**
 * Section title for the gallery. `sticky` pins it, on an opaque backdrop, to
 * the top of the gallery's scroll pane.
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
    <div className="bg-surface-sunken sticky top-0 z-10 -mx-4 -mt-2 px-4 pt-2">
      {title}
    </div>
  );
}
