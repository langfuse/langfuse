/* eslint-disable @repo/no-style-props */
"use client";

import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";

import { cn } from "@/src/utils/tailwind";

const Avatar = React.forwardRef<
  React.ComponentRef<typeof AvatarPrimitive.Root>,
  Pick<
    React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>,
    "aria-hidden" | "children"
  > & { className?: "h-8 w-8" | "h-6 w-6" | "h-8 w-8 rounded-lg" | "h-7 w-7" }
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex h-8 w-8 shrink-0 overflow-hidden rounded-full",
      className,
    )}
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

const AvatarFallback = React.forwardRef<
  React.ComponentRef<typeof AvatarPrimitive.Fallback>,
  Pick<
    React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>,
    "children"
  > & { className?: "text-xs" | "rounded-lg" | "bg-tertiary" }
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn(
      "bg-muted flex h-full w-full items-center justify-center rounded-full",
      className,
    )}
    {...props}
  />
));
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;

export { Avatar, AvatarImage, AvatarFallback };
