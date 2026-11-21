import type { ReactNode } from "react";

import { Label } from "@/src/components/ui/label";

export type FieldHeaderProps = {
  label: string;
  description: ReactNode;
} & ({ htmlFor: string; id?: never } | { id: string; htmlFor?: never });

/**
 * Label plus description above a provider dialog field. Groups of inputs pass
 * `id` for `aria-labelledby` instead of `htmlFor`.
 */
export function FieldHeader({
  label,
  description,
  htmlFor,
  id,
}: FieldHeaderProps) {
  return (
    <div className="mb-2 space-y-2">
      <Label htmlFor={htmlFor} id={id}>
        {label}
      </Label>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
  );
}
