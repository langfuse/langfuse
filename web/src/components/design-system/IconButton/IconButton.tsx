import { cva } from "class-variance-authority";
import { type LucideIcon } from "lucide-react";
import { type ComponentProps, type Ref } from "react";
import { cn } from "@/src/utils/tailwind";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md ring-offset-background transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        ghost: "hover:bg-accent hover:text-accent-foreground",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        subtle: "hover:bg-border aria-expanded:bg-border",
        toolbar:
          "text-muted-foreground hover:bg-accent hover:text-foreground aria-pressed:text-primary rounded-sm",
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

const iconVariants = cva("text-icon-foreground shrink-0", {
  variants: {
    size: {
      xs: "icon-sm",
      sm: "icon-base",
      md: "icon-base",
    },
  },
  defaultVariants: {
    size: "md",
  },
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
  variant?: "ghost" | "outline" | "subtle" | "toolbar";
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
      className={cn(buttonVariants({ size, variant }))}
      ref={ref}
      type={type}
    >
      <Icon
        className={cn(
          iconVariants({ size }),
          variant === "toolbar" && "icon-sm text-current",
        )}
        aria-hidden
      />
    </button>
  );
}
