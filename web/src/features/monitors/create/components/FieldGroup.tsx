import { type ReactNode } from "react";

/** FieldGroup lays out a labelled group of controls like a form field when no single control owns the label. */
export function FieldGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm leading-none font-bold">{label}</p>
      {children}
    </div>
  );
}
