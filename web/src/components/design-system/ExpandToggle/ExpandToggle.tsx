import { ChevronDown, ChevronUp } from "lucide-react";

import { Button } from "@/src/components/design-system/Button/Button";

type ExpandToggleProps = {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  /** Shown while collapsed. */
  label?: string;
  /** Shown while expanded. */
  expandedLabel?: string;
  /** `plain` is an underlined link; `icon` swaps the underline for a chevron that flips with the state. */
  variant?: "plain" | "icon";
  /** Which side of the label the icon sits on. */
  iconPosition?: "left" | "right";
  size?: "default" | "sm";
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
  size = "sm",
  controls,
}: ExpandToggleProps) {
  const handleClick = () => {
    onExpandedChange(!expanded);
  };
  const chevron = expanded ? ChevronUp : ChevronDown;

  return (
    <Button
      variant="text"
      underline={variant === "plain"}
      size={size}
      text={expanded ? expandedLabel : label}
      icon={variant === "icon" ? chevron : undefined}
      iconPosition={iconPosition}
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={handleClick}
    />
  );
}
