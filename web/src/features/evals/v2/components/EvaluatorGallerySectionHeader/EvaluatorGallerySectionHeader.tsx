import type { ReactNode } from "react";

/** Section title for the gallery. */
type EvaluatorGallerySectionHeaderProps = {
  label: string;
  children?: ReactNode;
};

export function EvaluatorGallerySectionHeader({
  label,
  children,
}: EvaluatorGallerySectionHeaderProps) {
  return (
    <div className="flex items-center gap-2">
      <h4 className="text-foreground text-base font-bold">{label}</h4>
      {children}
    </div>
  );
}
