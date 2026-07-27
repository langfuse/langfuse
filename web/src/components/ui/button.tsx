import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/src/utils/tailwind";

import { default as SpinnerLib } from "@/src/components/design-system/Spinner/Spinner";

const buttonVariants = cva(
  // No font-* here: buttons follow the text-sm token weight (one weight per
  // token; heavier text must be an explicit, deliberate exception).
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm ring-offset-background transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        "destructive-secondary":
          "bg-secondary text-secondary-foreground border border-destructive disabled:hover:bg-secondary disabled:hover:text-secondary-foreground hover:bg-destructive/90 hover:text-destructive-foreground",
        outline:
          // border-contrast, not border-input: on dark surfaces the filled
          // primary reads optically larger than an outlined twin of the same
          // geometry — a brighter border lets the shape assert itself.
          "border-border-contrast bg-background hover:bg-accent hover:text-accent-foreground border",
        "outline-success":
          "border border-accent-dark-green bg-background text-accent-dark-green hover:bg-accent-light-green hover:text-accent-dark-green dark:border-dark-green dark:text-dark-green dark:hover:bg-light-green dark:hover:text-dark-green",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        tertiary:
          "bg-tertiary text-tertiary-foreground hover:bg-tertiary/80 text-xs",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        // Same color as real hyperlinks (--link pair), not text-primary —
        // one link color across the app.
        link: "text-link hover:text-link-hover underline-offset-4 hover:underline",
        errorNotification:
          "bg-destructive-foreground/90 text-destructive hover:bg-destructive-foreground/80",
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
    },
    defaultVariants: {
      variant: "default",
      size: "default",
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
        className={cn(buttonVariants({ variant, size, className }))}
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
