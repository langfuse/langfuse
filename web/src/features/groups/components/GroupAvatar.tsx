import { cva, type VariantProps } from "class-variance-authority";
import { Users } from "@langfuse/icons";

const groupAvatarVariants = cva(
  "bg-muted flex shrink-0 items-center justify-center rounded-full",
  {
    variants: {
      size: {
        sm: "size-6",
        lg: "size-10",
      },
    },
    defaultVariants: { size: "sm" },
  },
);

export function GroupAvatar({
  size,
}: VariantProps<typeof groupAvatarVariants>) {
  return (
    <span className={groupAvatarVariants({ size })} aria-hidden="true">
      <Users size="base" color="secondary" aria-hidden="true" />
    </span>
  );
}
