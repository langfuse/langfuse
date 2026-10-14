import {
  Button,
  type ButtonProps,
} from "@/src/app/design-system/legacy-primitives/button";
import { type LucideIcon } from "lucide-react";
import { forwardRef } from "react";
import { cn } from "@/src/app/utils/tailwind";

export const ButtonWithIcon = forwardRef<
  HTMLButtonElement,
  {
    disabled: boolean;
    icon: LucideIcon;
    onClick: NonNullable<ButtonProps["onClick"]>;
    size: NonNullable<ButtonProps["size"]>;
    text: string;
    variant: NonNullable<ButtonProps["variant"]>;
  }
>(({ icon: Icon, text, ...buttonProps }, ref) => (
  <Button ref={ref} className="gap-1.5" {...buttonProps}>
    <Icon
      aria-hidden="true"
      className={cn(
        buttonProps.size === "xs" || buttonProps.size === "icon-xs"
          ? "icon-sm"
          : "icon-base",
        (buttonProps.variant === "outline" ||
          buttonProps.variant === "ghost") &&
          "text-icon-foreground",
      )}
    />
    {text}
  </Button>
));

ButtonWithIcon.displayName = "ButtonWithIcon";
