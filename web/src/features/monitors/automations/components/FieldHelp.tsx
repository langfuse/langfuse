import { type ReactNode } from "react";

/** FieldHelp is help text with inline code or links, rendered below a field whose input lists `id` in aria-describedby. */
export function FieldHelp({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  return (
    <p id={id} className="text-muted-foreground text-sm">
      {children}
    </p>
  );
}
