"use client";

import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cva, type VariantProps } from "class-variance-authority";

import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { cn } from "@/src/utils/tailwind";

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

const tintedFallbackClasses = [
  "bg-light-blue text-dark-blue",
  "bg-light-green text-dark-green",
  "bg-light-yellow text-dark-yellow",
  "bg-light-violet text-dark-violet",
];

/** Stable per name, so the same person keeps their color across renders. */
function tintedFallbackClass(seed: string) {
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) % 1_000_003;
  }
  return tintedFallbackClasses[hash % tintedFallbackClasses.length];
}

type AvatarProps = {
  "aria-hidden"?: boolean | "true" | "false";
  displayName: string;
  /**
   * Second hover line when it differs from `displayName`. Pass the address
   * here and keep `displayName` as the name so initials stay the person's.
   * When only an email is known, pass that email as `displayName`.
   */
  email?: string;
  src?: string;
  /** `tinted` colors the initials fallback per person, e.g. in avatar stacks. */
  tone?: "muted" | "tinted";
} & VariantProps<typeof avatarVariants>;

function avatarHoverLabel(displayName: string, email?: string) {
  const name = displayName.trim();
  const mail = email?.trim() || null;
  if (name && mail && name.toLowerCase() !== mail.toLowerCase()) {
    return `${name}\n${mail}`;
  }
  return name || mail || "User";
}

const Avatar = React.forwardRef<
  React.ComponentRef<typeof AvatarPrimitive.Root>,
  AvatarProps
>(({ src, displayName, email, size, shape, tone = "muted", ...props }, ref) => {
  const hoverLabel = avatarHoverLabel(displayName, email);
  const accessibleName = hoverLabel.split("\n").join(", ");
  const normalizedDisplayName = displayName.trim() || email?.trim() || "User";
  const initials = normalizedDisplayName
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join("")
    .toUpperCase();
  const hidden =
    props["aria-hidden"] === true || props["aria-hidden"] === "true";

  return (
    <Tooltip label={hoverLabel}>
      {({ getTriggerProps }) => (
        <span
          {...getTriggerProps()}
          className="inline-flex shrink-0"
          aria-hidden={hidden ? true : undefined}
          aria-label={hidden ? undefined : accessibleName}
          role={hidden ? undefined : "img"}
        >
          <AvatarPrimitive.Root
            ref={ref}
            className={avatarVariants({ size, shape })}
            {...props}
          >
            {src ? (
              <AvatarPrimitive.Image
                src={src}
                alt=""
                className="aspect-square h-full w-full"
              />
            ) : null}
            <AvatarPrimitive.Fallback
              className={cn(
                "flex h-full w-full items-center justify-center rounded-[inherit]",
                tone === "tinted"
                  ? tintedFallbackClass(normalizedDisplayName)
                  : "bg-muted",
              )}
            >
              {initials}
            </AvatarPrimitive.Fallback>
          </AvatarPrimitive.Root>
        </span>
      )}
    </Tooltip>
  );
});

Avatar.displayName = AvatarPrimitive.Root.displayName;

export { Avatar };
