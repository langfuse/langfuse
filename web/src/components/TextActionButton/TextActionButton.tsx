import { Plus, type LucideIcon } from "lucide-react";
import {
  type ComponentPropsWithoutRef,
  type MouseEventHandler,
  type Ref,
} from "react";

import { cn } from "@/src/utils/tailwind";

/** Underlined text action with a leading icon. */
export function TextActionButton({
  text,
  icon: Icon = Plus,
  width = "content",
  type = "button",
  disabled,
  onClick,
  ref,
  ...props
}: {
  text: string;
  icon?: LucideIcon;
  width?: "content" | "fill";
  ref?: Ref<HTMLButtonElement>;
} & Omit<
  ComponentPropsWithoutRef<"button">,
  "className" | "children" | "type" | "disabled" | "onClick"
> & {
    type?: "button" | "submit";
    disabled?: boolean;
    onClick?: MouseEventHandler<HTMLButtonElement>;
  }) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      onClick={onClick}
      {...props}
      className={cn(
        "text-foreground hover:text-foreground inline-flex h-6 items-center gap-1.5 px-0 py-0 text-xs leading-none underline-offset-4 hover:bg-transparent hover:underline disabled:cursor-not-allowed disabled:opacity-50",
        width === "fill" && "w-full justify-start",
      )}
    >
      <Icon className="icon-base text-icon-foreground shrink-0" aria-hidden />
      {text}
    </button>
  );
}
