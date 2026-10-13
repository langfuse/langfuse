import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";

export type SectionCollapseButtonProps = {
  isCollapsed: boolean;
  onToggle: () => void;
  /** What gets collapsed, e.g. "system prompt". */
  label: string;
};

/** Hover-revealed header toggle for sections with a collapsed state. */
export function SectionCollapseButton({
  isCollapsed,
  onToggle,
  label,
}: SectionCollapseButtonProps) {
  const text = `${isCollapsed ? "Expand" : "Collapse"} ${label}`;
  return (
    <CustomTooltip content={<span>{text}</span>} hoverableContent={false}>
      {({ getTriggerProps }) => (
        <IconButton
          {...getTriggerProps()}
          icon={isCollapsed ? ChevronsUpDown : ChevronsDownUp}
          label={text}
          size="sm"
          onClick={onToggle}
        />
      )}
    </CustomTooltip>
  );
}
