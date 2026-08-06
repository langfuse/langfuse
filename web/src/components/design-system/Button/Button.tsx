import { type ComponentType } from "react";

import { cn } from "@/src/utils/tailwind";

/**
 * Design-system Button, styled after the langfuse.com button: compact,
 * near-square corners, soft double shadow, ink-solid primary, bordered
 * icon-chip area and crop-mark corners on hover. Colors ride the
 * design-system-test semantic tokens (globals.css), so both themes work.
 *
 * `state` forces a visual state for specs and review; the real interactive
 * states (hover, focus-visible, disabled) always apply natively too.
 */

type Importance = "primary" | "secondary" | "borderless";
type Status = "default" | "warning";
type ForcedState = "default" | "focused" | "hovered" | "disabled";

/** Icon modes; anything but text-only requires the icon component. */
type IconProps =
  | { icon?: "text-only" }
  | {
      icon: "text-and-icon" | "icon-only";
      Icon: ComponentType<{ className?: string }>;
    };

export type ButtonProps = {
  /** Visible label; icon-only buttons expose it as the accessible name. */
  label: string;
  importance?: Importance;
  status?: Status;
  state?: ForcedState;
  onClick?: () => void;
} & IconProps;

/** Base + per-(importance, status) classes. Hover surfaces are the
 * crop-mark corners (wrapper CSS), not a fill shift — like langfuse.com;
 * borderless additionally brightens its label. */
const CONTROL_BASE =
  "inline-flex h-8 items-center rounded-[2px] text-xs tracking-[-0.06px] whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50";

const CONTROL_STYLES: Record<Importance, Record<Status, string>> = {
  primary: {
    default:
      "border border-[var(--text-secondary)] bg-[var(--text-primary)] text-[var(--bg-elevation-1)] shadow-[var(--ds-button-shadow)]",
    warning:
      "border border-amber-600 bg-amber-500 text-amber-950 shadow-[var(--ds-button-shadow)]",
  },
  secondary: {
    default:
      "border border-[var(--border-default)] bg-[var(--bg-elevation-1)] text-[var(--text-secondary)] shadow-[var(--ds-button-shadow)]",
    warning:
      "border border-amber-300 bg-[var(--bg-elevation-1)] text-amber-700 shadow-[var(--ds-button-shadow)] dark:border-amber-800 dark:text-amber-400",
  },
  borderless: {
    default:
      "border border-transparent bg-transparent hover:text-[var(--text-primary)]",
    warning: "border border-transparent bg-transparent",
  },
};

/** Borderless label tiers (base vs forced-hover), kept conflict-free. */
const BORDERLESS_TEXT: Record<Status, { rest: string; hovered: string }> = {
  default: {
    rest: "text-[var(--text-secondary)]",
    hovered: "text-[var(--text-primary)]",
  },
  warning: {
    rest: "text-amber-700 dark:text-amber-400",
    hovered: "text-amber-800 dark:text-amber-300",
  },
};

const FORCED_FOCUS =
  "ring-2 ring-ring ring-offset-2 ring-offset-background outline-none";

/** Per-icon-mode layout of the control. */
const ICON_LAYOUT: Record<"text-only" | "text-and-icon" | "icon-only", string> =
  {
    "text-only": "justify-center px-2.5",
    "text-and-icon": "gap-1.5 pr-2 pl-[3px]",
    "icon-only": "w-8 justify-center px-0",
  };

export function Button(props: ButtonProps) {
  const {
    label,
    importance = "primary",
    status = "default",
    state = "default",
    onClick,
  } = props;
  const icon = props.icon ?? "text-only";
  const IconComponent = "Icon" in props ? props.Icon : undefined;
  const disabled = state === "disabled";
  const borderless = importance === "borderless";

  const control = (
    <button
      type="button"
      disabled={disabled}
      aria-label={icon === "icon-only" ? label : undefined}
      onClick={onClick}
      className={cn(
        CONTROL_BASE,
        CONTROL_STYLES[importance][status],
        borderless &&
          BORDERLESS_TEXT[status][state === "hovered" ? "hovered" : "rest"],
        state === "focused" && FORCED_FOCUS,
        state === "disabled" && "pointer-events-none opacity-50",
        ICON_LAYOUT[icon],
      )}
    >
      {icon === "text-and-icon" && IconComponent && (
        <span
          aria-hidden
          className="flex aspect-square h-full items-center justify-center rounded-[1.5px] border-[0.5px] border-current/25 bg-current/10"
        >
          <IconComponent className="size-[var(--icon-size-md)]" />
        </span>
      )}
      {icon === "icon-only" && IconComponent ? (
        <IconComponent className="size-[var(--icon-size-md)]" />
      ) : (
        <span className="truncate" title={label}>
          {label}
        </span>
      )}
    </button>
  );

  if (borderless) {
    return control;
  }

  return (
    <span
      data-ds-button=""
      data-hovered={state === "hovered" ? "" : undefined}
      className={cn(
        "relative inline-flex items-center p-1",
        disabled && "cursor-not-allowed",
      )}
    >
      <span
        aria-hidden
        data-ds-corners=""
        className="pointer-events-none absolute inset-0"
      />
      {control}
    </span>
  );
}
