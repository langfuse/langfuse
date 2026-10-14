import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { MarkdownJsonViewHeader } from "@/src/components/ui/MarkdownJsonView";

export type IOSectionProps = {
  title: React.ReactNode;
  /** Accessible name of the section, for the caret label. Defaults to
      `title` when that is a string. */
  titleText?: string;
  titleIcon?: React.ReactNode;
  /** Header copy control; omitted when the section has nothing to copy. */
  onCopy?: (event?: React.MouseEvent<HTMLButtonElement>) => void;
  controlButtons?: React.ReactNode;
  /** Initial state of an uncontrolled section. */
  defaultCollapsed?: boolean;
  /** Controlled state; the caret calls `onCollapsedChange`. */
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  children: React.ReactNode;
};

/**
 * One I/O section of the trace view: a grey card holding a header row (caret,
 * title, hover controls) and the body under it. The caret hides the whole
 * body; a collapsed section is just the header bar and does not render its
 * children.
 */
export function IOSection({
  title,
  titleText,
  titleIcon,
  onCopy,
  controlButtons,
  defaultCollapsed = false,
  collapsed,
  onCollapsedChange,
  children,
}: IOSectionProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(defaultCollapsed);
  const isCollapsed = collapsed ?? internalCollapsed;
  const label = titleText ?? (typeof title === "string" ? title : "section");
  const Caret = isCollapsed ? ChevronRight : ChevronDown;

  const toggle = () => {
    const next = !isCollapsed;
    if (onCollapsedChange) {
      onCollapsedChange(next);
    } else {
      setInternalCollapsed(next);
    }
  };

  return (
    // overflow-clip (not hidden) so the sticky header can track the panel scroll.
    <div className="group/iosection bg-surface-output flex flex-col overflow-clip rounded-md">
      <MarkdownJsonViewHeader
        title={title}
        titleIcon={titleIcon}
        inset
        leading={
          <button
            type="button"
            className="focus-visible:ring-ring flex shrink-0 items-center justify-center rounded-sm focus-visible:ring-2 focus-visible:outline-hidden"
            aria-expanded={!isCollapsed}
            aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${label}`}
            onClick={toggle}
          >
            <Caret className="icon-base text-icon-foreground" aria-hidden />
          </button>
        }
        handleOnCopy={onCopy}
        // A collapsed section offers nothing to copy or act on.
        hideCopyButton={!onCopy || isCollapsed}
        hoverRevealControls
        controlButtons={isCollapsed ? undefined : controlButtons}
      />
      {!isCollapsed && (
        <div className="io-message-content ph-no-capture px-3 pb-2">
          {children}
        </div>
      )}
    </div>
  );
}
