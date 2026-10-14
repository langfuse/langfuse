import type { ReactNode } from "react";

/** Section title for the gallery. */
export function EvaluatorGallerySectionHeader({
  label,
  children,
}: {
  label: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <h4 className="text-foreground text-base font-bold">{label}</h4>
      {children}
    </div>
  );
}
