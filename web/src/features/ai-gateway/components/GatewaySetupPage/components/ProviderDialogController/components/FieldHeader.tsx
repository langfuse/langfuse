import type { ReactNode } from "react";

import { Label } from "@/src/components/ui/label";

export type FieldHeaderProps = {
  htmlFor: string;
  label: string;
  description: ReactNode;
};

/** Label plus description above a provider dialog field. */
export function FieldHeader({ htmlFor, label, description }: FieldHeaderProps) {
  return (
    <div className="mb-2 space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
  );
}
