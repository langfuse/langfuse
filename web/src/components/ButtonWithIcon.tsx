import { Button, type ButtonProps } from "@/src/components/ui/button";
import { type LucideIcon } from "lucide-react";
import { forwardRef } from "react";

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
    <Icon className="size-4" aria-hidden="true" />
    {text}
  </Button>
));

ButtonWithIcon.displayName = "ButtonWithIcon";
