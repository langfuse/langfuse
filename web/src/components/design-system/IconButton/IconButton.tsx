import { cva } from "class-variance-authority";
import { type LucideIcon } from "lucide-react";
import { type ComponentProps, type Ref } from "react";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md ring-offset-background transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        ghost:
          "hover:bg-accent hover:text-accent-foreground [&:not(.text-destructive)_svg:not([class*='text-'])]:text-icon-foreground",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground [&:not(.text-destructive)_svg:not([class*='text-'])]:text-icon-foreground",
        subtle:
          "hover:bg-border aria-expanded:bg-border [&:not(.text-destructive)_svg:not([class*='text-'])]:text-icon-foreground",
      },
      size: {
        xs: "size-4 rounded-sm [&_svg:not([class*='icon-'])]:icon-sm",
        sm: "size-6 [&_svg:not([class*='icon-'])]:icon-base",
        md: "size-8 [&_svg:not([class*='icon-'])]:icon-base",
      },
    },
    defaultVariants: {
      variant: "ghost",
      size: "md",
    },
  },
);

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
      <Icon className="shrink-0" aria-hidden />
    </button>
  );
}
