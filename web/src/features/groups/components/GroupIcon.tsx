import { Users } from "@langfuse/icons";
import { cva, type VariantProps } from "class-variance-authority";

const groupIconVariants = cva(
  "bg-muted flex shrink-0 items-center justify-center rounded-full",
  {
    variants: {
      size: {
        /** Sits before a group's name in a row. */
        sm: "size-6",
        /** Heads a card about a group. */
        lg: "size-10",
      },
    },
    defaultVariants: { size: "sm" },
  },
);

/** The round people icon that marks a group. */
export function GroupIcon({ size }: VariantProps<typeof groupIconVariants>) {
  return (
    <span className={groupIconVariants({ size })} aria-hidden="true">
      <Users size="base" color="secondary" aria-hidden="true" />
    </span>
  );
}
