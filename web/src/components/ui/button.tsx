import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/src/utils/tailwind";

import { default as SpinnerLib } from "@/src/components/design-system/Spinner/Spinner";

const buttonVariants = cva(
  // No font-* here: buttons follow the text-sm token weight (one weight per
  // token; heavier text must be an explicit, deliberate exception).
  "inline-flex items-center whitespace-nowrap rounded-md text-sm ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground transition-colors hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground transition-colors hover:bg-destructive/90",
        "destructive-secondary":
          "border border-destructive bg-secondary text-secondary-foreground transition-colors hover:bg-destructive/90 hover:text-destructive-foreground disabled:hover:bg-secondary disabled:hover:text-secondary-foreground",
        outline:
          // border-contrast, not border-input: on dark surfaces the filled
          // primary reads optically larger than an outlined twin of the same
          // geometry — a brighter border lets the shape assert itself.
          "border border-border-contrast bg-background transition-colors hover:bg-accent hover:text-accent-foreground",
        "outline-success":
          "border border-accent-dark-green bg-background text-accent-dark-green transition-colors hover:bg-accent-light-green hover:text-accent-dark-green dark:border-dark-green dark:text-dark-green dark:hover:bg-light-green dark:hover:text-dark-green",
        secondary:
          "bg-secondary text-secondary-foreground transition-colors hover:bg-secondary/80",
        tertiary:
          "bg-tertiary text-xs text-tertiary-foreground transition-colors hover:bg-tertiary/80",
        ghost: "transition-colors hover:bg-accent hover:text-accent-foreground",
        // Same color as real hyperlinks (--link pair), not text-primary —
        // one link color across the app.
        link: "text-link underline-offset-4 transition-colors hover:text-link-hover hover:underline",
        errorNotification:
          "bg-destructive-foreground/90 text-destructive transition-colors hover:bg-destructive-foreground/80",
      },
      size: {
        default: "h-8 px-3 py-1",
        xs: "h-4 px-1 rounded-sm",
        sm: "h-6 rounded-md px-2.5",
        lg: "h-9 rounded-md px-8",
        icon: "h-8 w-8",
        "icon-xs": "h-6 w-6",
        "icon-sm": "h-6 rounded-md px-2",
      },
      alignment: {
        center: "justify-center",
        start: "justify-start",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      alignment: "center",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      alignment,
      asChild = false,
      loading = false,
      disabled,
      onClick,
      children,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, alignment, className }))}
        ref={ref}
        disabled={disabled || loading}
        onClick={loading || disabled ? undefined : onClick}
        {...props}
        type={props.type || "button"}
      >
        {loading ? <Spinner /> : children}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };

function Spinner() {
  return (
    <div className="flex h-1/2 items-center justify-center">
      <SpinnerLib size="full" />
    </div>
  );
}
