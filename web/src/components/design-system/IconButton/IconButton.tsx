import { cva } from "class-variance-authority";
import { type LucideIcon } from "lucide-react";
import { type ComponentProps, type Ref } from "react";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md ring-offset-background transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        ghost: "hover:bg-accent hover:text-accent-foreground",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        subtle: "hover:bg-border aria-expanded:bg-border",
      },
      size: {
        xs: "size-4 rounded-sm",
        sm: "size-6",
        md: "size-8",
      },
    },
    defaultVariants: {
      variant: "ghost",
      size: "md",
    },
  },
);

const iconVariants = cva("shrink-0", {
  variants: {
    size: {
      xs: "size-3",
      sm: "size-4",
      md: "size-4",
    },
  },
  defaultVariants: { size: "md" },
});

type NativeButtonProps = Omit<
  ComponentProps<"button">,
  "aria-label" | "children" | "className" | "style"
>;

type IconButtonProps = NativeButtonProps & {
  icon: LucideIcon;
  label: string;
  ref?: Ref<HTMLButtonElement>;
  size?: "xs" | "sm" | "md";
  variant?: "ghost" | "outline" | "subtle";
};

export function IconButton({
  icon: Icon,
  label,
  ref,
  size,
  type = "button",
  variant,
  ...buttonProps
}: IconButtonProps) {
  return (
    <button
      {...buttonProps}
      aria-label={label}
      className={buttonVariants({ size, variant })}
      ref={ref}
      type={type}
    >
      <Icon className={iconVariants({ size })} aria-hidden />
    </button>
  );
}
