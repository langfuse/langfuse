"use client";

import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cva, type VariantProps } from "class-variance-authority";

const avatarVariants = cva("relative flex shrink-0 overflow-hidden", {
  variants: {
    size: {
      sm: "h-6 w-6 text-xs",
      md: "h-7 w-7 text-sm",
      lg: "h-8 w-8 text-sm",
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

const avatarFallbackVariants = cva(
  "flex h-full w-full items-center justify-center rounded-[inherit]",
  {
    variants: {
      fallbackBackground: {
        muted: "bg-muted",
        tertiary: "bg-tertiary",
      },
    },
    defaultVariants: {
      fallbackBackground: "muted",
    },
  },
);

type AvatarProps = {
  "aria-hidden"?: boolean | "true" | "false";
  alt?: string;
  src?: string | Blob;
  fallback: React.ReactNode;
} & VariantProps<typeof avatarVariants> &
  VariantProps<typeof avatarFallbackVariants>;

const Avatar = React.forwardRef<
  React.ComponentRef<typeof AvatarPrimitive.Root>,
  AvatarProps
>(({ src, alt, fallback, size, shape, fallbackBackground, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={avatarVariants({ size, shape })}
    {...props}
  >
    {src ? (
      <AvatarPrimitive.Image
        src={src}
        alt={alt}
        className="aspect-square h-full w-full"
      />
    ) : null}
    <AvatarPrimitive.Fallback
      className={avatarFallbackVariants({
        fallbackBackground,
      })}
    >
      {fallback}
    </AvatarPrimitive.Fallback>
  </AvatarPrimitive.Root>
));

Avatar.displayName = AvatarPrimitive.Root.displayName;

export { Avatar };
