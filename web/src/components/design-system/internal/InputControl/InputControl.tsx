import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { type LucideIcon } from "lucide-react";
import { type ComponentPropsWithoutRef } from "react";

const inputControlVariants = cva(
  "bg-background ring-offset-background placeholder:text-foreground-tertiary focus-visible:ring-ring disabled:bg-muted/50 h-8 w-full rounded-md border px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-bold focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      contentLayout: {
        text: "min-w-14",
        spread: "flex min-w-0 items-center justify-between gap-1",
      },
      trailingAction: {
        true: "pr-10",
        false: null,
      },
      error: {
        true: "border-destructive [&_svg]:text-destructive",
        false: "border-input",
      },
    },
    defaultVariants: {
      error: false,
    },
  },
);

type InputControlProps = Omit<
  ComponentPropsWithoutRef<typeof Slot>,
  "className"
> & {
  contentLayout: "text" | "spread";
  error?: boolean;
  trailingAction?: {
    label: string;
    icon: LucideIcon;
    disabled?: boolean;
    pressed?: boolean;
    onClick: () => void;
  };
};

/**
 * Applies the shared form-control appearance directly to one interactive child.
 * Use explicit variants for root layout differences. The control owns the
 * positioning and spacing of an optional trailing action; specialized inputs
 * own the action's behavior and inner content.
 */
export function InputControl({
  contentLayout,
  error,
  trailingAction,
  ...props
}: InputControlProps) {
  const control = (
    <Slot
      className={inputControlVariants({
        contentLayout,
        error,
        trailingAction: Boolean(trailingAction),
      })}
      {...props}
    />
  );

  if (!trailingAction) return control;

  const TrailingActionIcon = trailingAction.icon;

  return (
    <div className="relative">
      {control}
      <button
        type="button"
        aria-label={trailingAction.label}
        aria-pressed={trailingAction.pressed}
        disabled={trailingAction.disabled}
        // Keep the action out of the tab order so Tab moves between inputs.
        tabIndex={-1}
        className="absolute top-1/2 right-3 flex -translate-y-1/2 cursor-pointer items-center justify-center disabled:cursor-not-allowed"
        onClick={trailingAction.onClick}
      >
        <TrailingActionIcon
          aria-hidden="true"
          className={
            error ? "text-destructive size-4" : "text-muted-foreground size-4"
          }
        />
      </button>
    </div>
  );
}
