import type { ReactNode } from "react";
import { Trash2 } from "@langfuse/icons";

import { IconButton } from "@/src/components/design-system/IconButton/IconButton";

type OptionalSectionProps = {
  /**
   * The remove button, e.g. labelled "Remove expiration". Undefined hides it,
   * e.g. for a setting that is locked or removes itself.
   */
  remove?: { label: string; onRemove: () => void };
  children: ReactNode;
};

/** A boxed optional setting of the key form, removable from its top corner. */
export function OptionalSection({ remove, children }: OptionalSectionProps) {
  return (
    <section className="relative rounded-lg border p-3">
      {children}
      {remove ? (
        <div className="absolute top-1.5 right-1.5">
          <IconButton
            icon={Trash2}
            label={remove.label}
            size="sm"
            onClick={remove.onRemove}
          />
        </div>
      ) : null}
    </section>
  );
}
