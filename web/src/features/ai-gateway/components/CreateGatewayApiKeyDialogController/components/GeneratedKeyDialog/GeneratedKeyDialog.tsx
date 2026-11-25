import type { ReactNode } from "react";

import { Dialog } from "@/src/components/design-system/Dialog/Dialog";

type GeneratedKeyDialogProps = {
  children: ReactNode;
};

/** The secret key is shown only once, so only Done closes this dialog. */
export function GeneratedKeyDialog({ children }: GeneratedKeyDialogProps) {
  return (
    <Dialog
      title="Gateway key created"
      size="md"
      closeLabel="Done"
      requireExplicitClose
    >
      {children}
    </Dialog>
  );
}
