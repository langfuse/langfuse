import { ChevronDown, ChevronUp } from "lucide-react";

import { Button } from "@/src/components/design-system/Button/Button";

type ExpandToggleProps = {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  /** Shown while collapsed. */
  label?: string;
  /** Shown while expanded. */
  expandedLabel?: string;
  /** `caret` adds a chevron that flips with the state. */
  variant?: "plain" | "caret";
  /** Which side of the label the caret sits on. */
  caretPosition?: "start" | "end";
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
  caretPosition = "start",
  size = "sm",
  controls,
}: ExpandToggleProps) {
  const handleClick = () => {
    onExpandedChange(!expanded);
  };
  const caret = expanded ? ChevronUp : ChevronDown;

  return (
    <Button
      variant="text"
      size={size}
      text={expanded ? expandedLabel : label}
      icon={variant === "caret" ? caret : undefined}
      iconPosition={caretPosition}
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={handleClick}
    />
  );
}
