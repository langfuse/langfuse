import { Button, type ButtonProps } from "@/src/components/ui/button";
import { type IconComponent } from "@langfuse/icons";
import { forwardRef } from "react";

export const ButtonWithIcon = forwardRef<
  HTMLButtonElement,
  {
    disabled: boolean;
    icon: IconComponent;
    onClick: NonNullable<ButtonProps["onClick"]>;
    size: NonNullable<ButtonProps["size"]>;
    text: string;
    variant: NonNullable<ButtonProps["variant"]>;
  }
>(({ icon: Icon, text, ...buttonProps }, ref) => (
  <Button ref={ref} className="gap-1.5" {...buttonProps}>
    <Icon
      aria-hidden="true"
      size={
        buttonProps.size === "xs" || buttonProps.size === "icon-xs"
          ? "sm"
          : "base"
      }
      color={
        buttonProps.variant === "outline" || buttonProps.variant === "ghost"
          ? "default"
          : "inherit"
      }
    />
    {text}
  </Button>
));

ButtonWithIcon.displayName = "ButtonWithIcon";
