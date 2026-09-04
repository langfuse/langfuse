import type { ReactNode } from "react";

import styles from "./InAppAgentUpdateHighlight.module.css";

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
        <div key={updateId} className={styles.highlight} aria-hidden="true" />
      ) : null}
    </div>
  );
}
