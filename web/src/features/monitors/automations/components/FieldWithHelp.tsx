import { type ReactNode } from "react";

/** FieldWithHelp keeps a form field and the FieldHelp below it as close together as the field's own help text. */
export function FieldWithHelp({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-2">{children}</div>;
}
