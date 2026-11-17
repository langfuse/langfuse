import type { ReactNode } from "react";
import { X } from "@langfuse/icons";

import { IconButton } from "@/src/components/design-system/IconButton/IconButton";

type OptionalSectionProps = {
  /** Names the remove button, e.g. "Remove expiration". */
  removeLabel: string;
  /** Undefined hides the remove button, e.g. for a setting that is locked. */
  onRemove?: () => void;
  children: ReactNode;
};

/** A boxed optional setting of the key form, removable from its top corner. */
export function OptionalSection({
  removeLabel,
  onRemove,
  children,
}: OptionalSectionProps) {
  return (
    <section className="bg-surface-section relative rounded-lg border p-3">
      {children}
      {onRemove ? (
        <div className="absolute top-1.5 right-1.5">
          <IconButton
            icon={X}
            label={removeLabel}
            size="sm"
            onClick={onRemove}
          />
        </div>
      ) : null}
    </section>
  );
}
