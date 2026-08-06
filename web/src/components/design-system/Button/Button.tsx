import { type ComponentType } from "react";

import { cn } from "@/src/utils/tailwind";

/**
 * Design-system Button, styled after the langfuse.com button: compact,
 * near-square corners, soft double shadow, ink-solid primary and a bordered
 * icon-chip area. Hover is a brightness filter. Colors ride the
 * design-system-test semantic tokens (globals.css), so both themes work.
 *
 * `state` forces a visual state for specs and review; the real interactive
 * states (hover, focus-visible, disabled) always apply natively too.
 */

type Importance = "primary" | "secondary" | "borderless";
type Status = "default" | "error" | "warning" | "success" | "info";
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

const CONTROL_BASE =
  "inline-flex h-[26px] items-center rounded-[2px] text-xs tracking-[-0.06px] whitespace-nowrap transition-[filter] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50";

const CONTROL_STYLES: Record<Importance, Record<Status, string>> = {
  primary: {
    default:
      "border border-[var(--text-secondary)] bg-[var(--text-primary)] text-[var(--bg-elevation-1)] shadow-[var(--ds-button-shadow)]",
    error:
      "border border-red-700 bg-red-600 text-white shadow-[var(--ds-button-shadow)]",
    warning:
      "border border-amber-600 bg-amber-500 text-amber-950 shadow-[var(--ds-button-shadow)]",
    success:
      "border border-emerald-700 bg-emerald-600 text-white shadow-[var(--ds-button-shadow)]",
    info: "border border-blue-700 bg-blue-600 text-white shadow-[var(--ds-button-shadow)]",
  },
  secondary: {
    default:
      "border border-[var(--border-default)] bg-[var(--bg-elevation-1)] text-[var(--text-secondary)] shadow-[var(--ds-button-shadow)]",
    error:
      "border border-red-300 bg-[var(--bg-elevation-1)] text-red-700 shadow-[var(--ds-button-shadow)] dark:border-red-800 dark:text-red-400",
    warning:
      "border border-amber-300 bg-[var(--bg-elevation-1)] text-amber-700 shadow-[var(--ds-button-shadow)] dark:border-amber-800 dark:text-amber-400",
    success:
      "border border-emerald-300 bg-[var(--bg-elevation-1)] text-emerald-700 shadow-[var(--ds-button-shadow)] dark:border-emerald-800 dark:text-emerald-400",
    info: "border border-blue-300 bg-[var(--bg-elevation-1)] text-blue-700 shadow-[var(--ds-button-shadow)] dark:border-blue-800 dark:text-blue-400",
  },
  borderless: {
    default: "border border-transparent bg-transparent",
    error: "border border-transparent bg-transparent",
    warning: "border border-transparent bg-transparent",
    success: "border border-transparent bg-transparent",
    info: "border border-transparent bg-transparent",
  },
};

const BORDERLESS_TEXT: Record<Status, string> = {
  default: "text-[var(--text-secondary)]",
  error: "text-red-700 dark:text-red-400",
  warning: "text-amber-700 dark:text-amber-400",
  success: "text-emerald-700 dark:text-emerald-400",
  info: "text-blue-700 dark:text-blue-400",
};

/** Hover = a brightness filter, no fill swap. Ink and paper fills need
 * opposite directions per theme, hence per-slot values; `forced` mirrors
 * the hover: classes for the spec-only state="hovered". */
const HOVER_FILTER: Record<
  Importance,
  Record<"default" | "status", { hover: string; forced: string }>
> = {
  primary: {
    default: {
      hover: "hover:brightness-[1.4] dark:hover:brightness-90",
      forced: "brightness-[1.4] dark:brightness-90",
    },
    status: { hover: "hover:brightness-90", forced: "brightness-90" },
  },
  secondary: {
    default: {
      hover: "hover:brightness-[0.96] dark:hover:brightness-[1.9]",
      forced: "brightness-[0.96] dark:brightness-[1.9]",
    },
    status: {
      hover: "hover:brightness-[0.96] dark:hover:brightness-[1.9]",
      forced: "brightness-[0.96] dark:brightness-[1.9]",
    },
  },
  borderless: {
    default: {
      hover: "hover:brightness-75 dark:hover:brightness-125",
      forced: "brightness-75 dark:brightness-125",
    },
    status: {
      hover: "hover:brightness-75 dark:hover:brightness-125",
      forced: "brightness-75 dark:brightness-125",
    },
  },
};

const FORCED_FOCUS =
  "ring-2 ring-ring ring-offset-2 ring-offset-background outline-none";

/** Per-icon-mode layout of the control. */
const ICON_LAYOUT: Record<"text-only" | "text-and-icon" | "icon-only", string> =
  {
    "text-only": "justify-center px-2",
    "text-and-icon": "gap-1.5 pr-2 pl-[3px]",
    "icon-only": "w-[26px] justify-center px-0",
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
  const hoverFilter =
    HOVER_FILTER[importance][status === "default" ? "default" : "status"];

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={icon === "icon-only" ? label : undefined}
      onClick={onClick}
      className={cn(
        CONTROL_BASE,
        CONTROL_STYLES[importance][status],
        importance === "borderless" && BORDERLESS_TEXT[status],
        hoverFilter.hover,
        state === "hovered" && hoverFilter.forced,
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
}
