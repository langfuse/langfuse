"use client";

import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cva } from "class-variance-authority";
import { type IconComponent, type IconSize } from "@langfuse/icons";
import { cn } from "@/src/utils/tailwind";

/** The tile's box and type per size and shape; LogoStack's "+N" tile shares it so the sizes stay in one place. */
export const logoTileVariants = cva(
  "inline-flex shrink-0 items-center justify-center overflow-hidden font-bold",
  {
    variants: {
      size: {
        xs: "size-4.5 text-xs",
        sm: "size-6 text-xs",
        md: "size-8 text-sm",
        lg: "size-10 text-base",
      },
      shape: {
        circle: "rounded-full",
        rounded: "rounded-md",
      },
    },
  },
);

const ICON_SIZE = {
  xs: "sm",
  sm: "sm",
  md: "base",
  lg: "lg",
} as const satisfies Record<string, IconSize>;

/** A dark logo turns light on a dark page and a light one dark on a light page, as langfuse.com draws them. */
const APPEARANCE = {
  dark: "dark:brightness-0 dark:invert",
  light: "invert dark:invert-0",
  color: null,
} as const;

type IntegrationLogoProps = {
  /** The integration, e.g. "LangChain": the accessible name, and the initials when there's no logo. */
  name: string;
  /** Its logo image; until it loads, or when it can't (an offline install), the icon or initials show instead. */
  image?: { src: string; appearance: "dark" | "light" | "color" };
  /** A brand icon from `@langfuse/icons/si`, drawn in the text colour; left out, the tile shows the name's initials. */
  icon?: IconComponent;
  size: "xs" | "sm" | "md" | "lg";
  shape: "circle" | "rounded";
  /** Hides it from screen readers when the name is written next to it. */
  isDecorative: boolean;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join("")
    .toUpperCase();
}

/**
 * An integration's logo on a small tile: its image once loaded, else its brand icon, else its initials. The image
 * loads lazily and without a referrer, so the page's address isn't sent to the image's host.
 */
export function IntegrationLogo({
  name,
  image,
  icon: Icon,
  size,
  shape,
  isDecorative,
}: IntegrationLogoProps) {
  return (
    <AvatarPrimitive.Root
      className={cn(
        "bg-background text-foreground border",
        logoTileVariants({ size, shape }),
      )}
      role={isDecorative ? undefined : "img"}
      aria-label={isDecorative ? undefined : name}
      aria-hidden={isDecorative ? true : undefined}
    >
      {image ? (
        <AvatarPrimitive.Image
          src={image.src}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className={cn(
            "size-[70%] object-contain",
            APPEARANCE[image.appearance],
          )}
        />
      ) : null}
      <AvatarPrimitive.Fallback className="flex size-full items-center justify-center">
        {Icon ? (
          <Icon size={ICON_SIZE[size]} aria-hidden />
        ) : (
          <span aria-hidden>{initials(name)}</span>
        )}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}
