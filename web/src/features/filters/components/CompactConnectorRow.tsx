import type * as React from "react";
import { cva } from "class-variance-authority";

/** indentVariants offsets the elbow: past a row label ("Where") or just inside the field above. */
const indentVariants = cva("shrink-0", {
  variants: {
    indent: { label: "w-16", field: "w-3.5" },
  },
});

/** contentVariants aligns the continuation line's controls. */
const contentVariants = cva("flex min-w-0 flex-1 gap-1.5 pt-2", {
  variants: {
    align: { center: "items-center", start: "items-start" },
  },
});

/** CompactConnectorRow renders a compact row's continuation line, hung off the row above by an elbow bracket. */
export const CompactConnectorRow = ({
  indent,
  align,
  children,
}: {
  indent: "label" | "field";
  align: "center" | "start";
  children: React.ReactNode;
}) => (
  <div className="flex items-start">
    <span className={indentVariants({ indent })} aria-hidden="true" />
    <div
      aria-hidden="true"
      className="border-input h-6 w-3 shrink-0 rounded-bl-md border-b-2 border-l-2"
    />
    <div className={contentVariants({ align })}>{children}</div>
  </div>
);
