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
  displayName: string;
  src?: string;
} & VariantProps<typeof avatarVariants>;

const Avatar = React.forwardRef<
  React.ComponentRef<typeof AvatarPrimitive.Root>,
  AvatarProps
>(({ src, displayName, size, shape, ...props }, ref) => {
  const normalizedDisplayName = displayName.trim() || "User";
  const initials = normalizedDisplayName
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join("")
    .toUpperCase();

  return (
    <AvatarPrimitive.Root
      ref={ref}
      className={avatarVariants({ size, shape })}
      {...props}
    >
      {src ? (
        <AvatarPrimitive.Image
          src={src}
          alt={normalizedDisplayName}
          className="aspect-square h-full w-full"
        />
      ) : null}
      <AvatarPrimitive.Fallback className="bg-muted flex h-full w-full items-center justify-center rounded-[inherit]">
        {initials}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
});

Avatar.displayName = AvatarPrimitive.Root.displayName;

export { Avatar };
