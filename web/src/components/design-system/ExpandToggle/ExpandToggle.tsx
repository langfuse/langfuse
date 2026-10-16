import { ChevronDown, ChevronUp } from "lucide-react";

import { Button } from "@/src/components/design-system/Button/Button";

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
  const chevron = expanded ? ChevronUp : ChevronDown;

  return (
    <Button
      variant="text"
      underline={variant === "underline"}
      size={size === "sm" ? "default" : "sm"}
      text={expanded ? expandedLabel : label}
      icon={variant === "icon" ? chevron : undefined}
      iconPosition={iconPosition}
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={handleClick}
    />
  );
}
