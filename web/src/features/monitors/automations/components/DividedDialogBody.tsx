import { type ReactNode } from "react";

/** DividedDialogBody is a scrolling dialog body set off from the header and footer by borders. */
export function DividedDialogBody({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto border-y p-4">
      {children}
    </div>
  );
}
