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

type AvatarProps = {
  "aria-hidden"?: boolean | "true" | "false";
  alt?: string;
  src?: string | Blob;
  fallback: string | string[] | null | undefined;
} & VariantProps<typeof avatarVariants>;

const Avatar = React.forwardRef<
  React.ComponentRef<typeof AvatarPrimitive.Root>,
  AvatarProps
>(({ src, alt, fallback, size, shape, ...props }, ref) => (
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
    <AvatarPrimitive.Fallback className="bg-muted flex h-full w-full items-center justify-center rounded-[inherit]">
      {fallback}
    </AvatarPrimitive.Fallback>
  </AvatarPrimitive.Root>
));

Avatar.displayName = AvatarPrimitive.Root.displayName;

export { Avatar };
