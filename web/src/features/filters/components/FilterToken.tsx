import { cva } from "class-variance-authority";
import { type ReactNode } from "react";

const filterTokenVariants = cva(
  "inline max-w-full rounded border border-border bg-secondary px-1.5 py-0.5 text-secondary-foreground shadow-sm transition-colors hover:border-ring hover:bg-accent",
  {
    variants: {
      deactivated: {
        true: "opacity-50 line-through decoration-1",
        false: "",
      },
      // Pointer-independent hover treatment: the caret/keyboard path marks the
      // token an open explanation refers to.
      highlighted: {
        true: "border-ring bg-accent",
        false: "",
      },
    },
  },
);

type FilterTokenProps = {
  children: ReactNode;
  deactivated: boolean;
  title?: string | undefined;
  highlighted?: boolean;
} & {
  [key: `data-${string}`]: string | boolean | undefined;
};

export function FilterToken({
  children,
  deactivated,
  title,
  highlighted = false,
  ...dataAttributes
}: FilterTokenProps) {
  return (
    <span
      {...dataAttributes}
      data-deactivated={deactivated || undefined}
      title={title}
      className={filterTokenVariants({ deactivated, highlighted })}
    >
      {children}
    </span>
  );
}
