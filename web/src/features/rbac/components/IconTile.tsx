import { cva, type VariantProps } from "class-variance-authority";
import { type IconComponent } from "@langfuse/icons";

const tileVariants = cva("bg-muted flex shrink-0 items-center justify-center", {
  variants: {
    shape: {
      /** Same box and icon size as the entity tiles in the project and organization switchers. */
      square: "size-9 rounded-md",
      /** Sits before a name in a row. */
      circle: "size-6 rounded-full",
      /** Heads a card about a group. */
      largeCircle: "size-10 rounded-full",
    },
  },
  defaultVariants: { shape: "square" },
});

/** A small muted tile holding one icon, to head a dialog, a card or a row. */
export function IconTile({
  icon: Icon,
  shape,
}: { icon: IconComponent } & VariantProps<typeof tileVariants>) {
  return (
    <span className={tileVariants({ shape })} aria-hidden="true">
      <Icon
        size="base"
        color={
          shape === undefined || shape === "square" ? "muted" : "secondary"
        }
        aria-hidden="true"
      />
    </span>
  );
}
