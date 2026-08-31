"use client";

import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cva, type VariantProps } from "class-variance-authority";

const avatarVariants = cva("relative flex shrink-0 overflow-hidden", {
  variants: {
    size: {
      sm: "h-6 w-6",
      md: "h-7 w-7",
      lg: "h-8 w-8",
    },
    shape: {
      circle: "rounded-full",
      rounded: "rounded-lg",
    },
  },
  defaultVariants: {
    size: "lg",
    shape: "circle",
  },
});

const Avatar = React.forwardRef<
  React.ComponentRef<typeof AvatarPrimitive.Root>,
  Pick<
    React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>,
    "aria-hidden" | "children"
  > &
    VariantProps<typeof avatarVariants>
>(({ size, shape, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={avatarVariants({ size, shape })}
    {...props}
  />
));

Avatar.displayName = AvatarPrimitive.Root.displayName;

const AvatarImage = React.forwardRef<
  React.ComponentRef<typeof AvatarPrimitive.Image>,
  Pick<
    React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>,
    "alt" | "src"
  >
>(({ ...props }, ref) => (
  <AvatarPrimitive.Image
    ref={ref}
    className="aspect-square h-full w-full"
    {...props}
  />
));

AvatarImage.displayName = AvatarPrimitive.Image.displayName;

const avatarFallbackVariants = cva(
  "flex h-full w-full items-center justify-center rounded-[inherit]",
  {
    variants: {
      textSize: {
        default: "",
        xs: "text-xs",
      },
      background: {
        muted: "bg-muted",
        tertiary: "bg-tertiary",
      },
    },
    defaultVariants: {
      textSize: "default",
      background: "muted",
    },
  },
);

const AvatarFallback = React.forwardRef<
  React.ComponentRef<typeof AvatarPrimitive.Fallback>,
  Pick<
    React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>,
    "children"
  > &
    VariantProps<typeof avatarFallbackVariants>
>(({ textSize, background, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={avatarFallbackVariants({ textSize, background })}
    {...props}
  />
));
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;

export { Avatar, AvatarImage, AvatarFallback };
