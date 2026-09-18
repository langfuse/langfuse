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
          className={cn(styles.highlight, "border-border border")}
          aria-hidden="true"
        >
          <span
            className={cn(
              styles.corner,
              styles.topLeft,
              "border-foreground/60",
            )}
          />
          <span
            className={cn(
              styles.corner,
              styles.topRight,
              "border-foreground/60",
            )}
          />
          <span
            className={cn(
              styles.corner,
              styles.bottomRight,
              "border-foreground/60",
            )}
          />
          <span
            className={cn(
              styles.corner,
              styles.bottomLeft,
              "border-foreground/60",
            )}
          />
        </div>
      ) : null}
    </div>
  );
}
