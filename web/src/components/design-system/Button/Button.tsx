import { type ComponentType } from "react";

import { cn } from "@/src/utils/tailwind";

/**
 * Design-system Button, styled after the langfuse.com button: compact,
 * near-square corners, soft double shadow, ink-solid primary. Hover is a
 * brightness filter. Colors ride the design-system-test semantic tokens
 * (globals.css), so both themes work.
 *
 * `state` forces a visual state for specs and review; the real interactive
 * states (hover, focus-visible, disabled) always apply natively too.
 */

type ButtonType = "primary" | "secondary" | "borderless";
type Status = "default" | "danger";
type ForcedState = "default" | "focused" | "hovered" | "disabled";

/** Icon modes; anything but text-only requires the icon component. */
type IconProps =
  | { icon?: "text-only" }
  | {
      icon: "text-and-icon" | "icon-only";
      Icon: ComponentType<{ className?: string }>;
    };

/** Destructive intent is not available on the primary type. */
type VariantProps =
  | { type?: ButtonType; status?: "default" }
  | { type?: "secondary" | "borderless"; status: "danger" };

export type ButtonProps = {
  /** Visible label; icon-only buttons expose it as the accessible name. */
  label: string;
  state?: ForcedState;
  onClick?: () => void;
} & VariantProps &
  IconProps;

const CONTROL_BASE =
  "inline-flex h-[26px] items-center rounded-[2px] text-xs tracking-[-0.06px] whitespace-nowrap transition-[filter,color,background-color,border-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50";

const CONTROL_STYLES: {
  primary: { default: string };
  secondary: Record<Status, string>;
  borderless: Record<Status, string>;
} = {
  primary: {
    default: "bg-inverse text-on-inverse shadow-1 border border-transparent",
  },
  secondary: {
    default: "border-default bg-elevation-1 text-primary shadow-1 border",
    danger: "border-default bg-elevation-1 text-status-error shadow-1 border",
  },
  borderless: {
    default: "text-secondary border border-transparent bg-transparent",
    danger: "text-status-error border border-transparent bg-transparent",
  },
};

/** Human-readable token routing per variant, shown by the Storybook
 * variant matrix. Keep in sync with CONTROL_STYLES above. */
export const BUTTON_TOKENS: {
  primary: { default: string };
  secondary: Record<Status, string>;
  borderless: Record<Status, string>;
} = {
  primary: {
    default: "bg-inverse · text-on-inverse",
  },
  secondary: {
    default: "bg-elevation-1 · text-primary · border-default",
    danger: "bg-elevation-1 · text-status-error · border-default",
  },
  borderless: {
    default: "text-secondary",
    danger: "text-status-error",
  },
};

/** Hover treatment per slot: mostly a brightness filter; the danger
 * secondary swaps to the red fill (GitHub-style). `forced` mirrors the
 * hover: classes for the spec-only state="hovered". */
const HOVER_FILTER: {
  primary: { default: { hover: string; forced: string } };
  secondary: Record<Status, { hover: string; forced: string }>;
  borderless: Record<Status, { hover: string; forced: string }>;
} = {
  primary: {
    default: {
      hover: "hover:brightness-[1.4] dark:hover:brightness-90",
      forced: "brightness-[1.4] dark:brightness-90",
    },
  },
  secondary: {
    default: {
      hover: "hover:brightness-[0.96] dark:hover:brightness-[1.9]",
      forced: "brightness-[0.96] dark:brightness-[1.9]",
    },
    danger: {
      hover:
        "hover:border-status-error-fill-hover hover:bg-status-error-fill-hover hover:text-on-inverse",
      forced:
        "border-status-error-fill-hover bg-status-error-fill-hover text-on-inverse",
    },
  },
  borderless: {
    default: {
      hover: "hover:brightness-75 dark:hover:brightness-125",
      forced: "brightness-75 dark:brightness-125",
    },
    danger: {
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
    "text-and-icon": "gap-1.5 px-2",
    "icon-only": "w-[26px] justify-center px-0",
  };

export function Button(props: ButtonProps) {
  const { label, state = "default", onClick } = props;
  const status = props.status ?? "default";
  // Danger has no primary treatment; an unspecified type falls back to
  // secondary there (the union already forbids the explicit combination).
  const type = props.type ?? (status === "danger" ? "secondary" : "primary");
  const icon = props.icon ?? "text-only";
  const IconComponent = "Icon" in props ? props.Icon : undefined;
  const disabled = state === "disabled";
  const control =
    type === "primary"
      ? CONTROL_STYLES.primary.default
      : CONTROL_STYLES[type][status];
  const hoverFilter =
    type === "primary"
      ? HOVER_FILTER.primary.default
      : HOVER_FILTER[type][status];

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={icon === "icon-only" ? label : undefined}
      onClick={onClick}
      className={cn(
        CONTROL_BASE,
        control,
        hoverFilter.hover,
        state === "hovered" && hoverFilter.forced,
        state === "focused" && FORCED_FOCUS,
        state === "disabled" && "pointer-events-none opacity-50",
        ICON_LAYOUT[icon],
      )}
    >
      {icon === "text-and-icon" && IconComponent && (
        <IconComponent
          aria-hidden
          className="size-[var(--icon-size-md)] shrink-0"
        />
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
