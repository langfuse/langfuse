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
        "bg-secondary text-secondary-foreground relative inline-flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-medium",
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
      unoptimized
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
        "bg-muted text-muted-foreground inline-flex size-full items-center justify-center rounded-full",
        className,
      )}
      {...props}
    />
  );
}
