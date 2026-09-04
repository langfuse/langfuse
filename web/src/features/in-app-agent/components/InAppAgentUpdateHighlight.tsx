import type { ReactNode } from "react";

import styles from "./InAppAgentUpdateHighlight.module.css";
import { cn } from "@/src/utils/tailwind";

export function InAppAgentUpdateHighlight({
  updateId,
  children,
}: {
  updateId: string | null;
  children: ReactNode;
}) {
  return (
    <div className={styles.root}>
      {children}
      {updateId ? (
        <div
          key={updateId}
          className={cn(
            styles.highlight,
            "border-primary/60 ring-primary/20 border-2 ring-2",
          )}
          aria-hidden="true"
        />
      ) : null}
    </div>
  );
}
