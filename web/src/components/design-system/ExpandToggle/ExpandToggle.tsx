import { cva } from "class-variance-authority";
import { ChevronDown, ChevronUp } from "@langfuse/icons";

const expandToggleVariants = cva(
  "text-muted-foreground hover:text-foreground ring-offset-background focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-md whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden",
  {
    variants: {
      variant: {
        plain: "",
        underline: "underline",
        icon: "",
      },
      size: {
        xs: "text-xs",
        sm: "text-sm",
      },
    },
  },
);

type ExpandToggleProps = {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  /** Shown while collapsed. */
  label?: string;
  /** Shown while expanded. */
  expandedLabel?: string;
  /** `plain` is muted text, `underline` adds an underline, `icon` adds a chevron that flips with the state. */
  variant?: "plain" | "underline" | "icon";
  /** Which side of the label the icon sits on. */
  iconPosition?: "left" | "right";
  /** Matches the text size: `xs` 12px (default), `sm` 13px. */
  size?: "xs" | "sm";
  /** Id of the element it shows and hides. */
  controls?: string;
};

/** Shows or hides more of a list or a clipped block of content. */
export function ExpandToggle({
  expanded,
  onExpandedChange,
  label = "Show more",
  expandedLabel = "Show less",
  variant = "plain",
  iconPosition = "left",
  size = "xs",
  controls,
}: ExpandToggleProps) {
  const handleClick = () => {
    onExpandedChange(!expanded);
  };
  const Chevron = expanded ? ChevronUp : ChevronDown;
  const icon =
    variant === "icon" ? <Chevron color="inherit" aria-hidden /> : null;

  return (
    <button
      type="button"
      className={expandToggleVariants({ variant, size })}
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={handleClick}
    >
      {iconPosition === "left" ? icon : null}
      {expanded ? expandedLabel : label}
      {iconPosition === "right" ? icon : null}
    </button>
  );
}
