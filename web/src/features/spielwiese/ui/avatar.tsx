import Image, { type ImageProps } from "next/image";
import type { HTMLAttributes } from "react";
import { cn } from "@/src/utils/tailwind";

export function Avatar({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "bg-secondary text-secondary-foreground ring-border/70 relative inline-flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl text-sm font-medium ring-1",
        className,
      )}
      {...props}
    />
  );
}

export function AvatarImage({
  className,
  alt = "",
  height = 40,
  width = 40,
  ...props
}: Omit<ImageProps, "alt"> & { alt?: string }) {
  return (
    <Image
      alt={alt}
      className={cn("size-full object-cover", className)}
      height={height}
      {...props}
      width={width}
    />
  );
}

export function AvatarFallback({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "bg-secondary text-secondary-foreground inline-flex size-full items-center justify-center rounded-2xl",
        className,
      )}
      {...props}
    />
  );
}
