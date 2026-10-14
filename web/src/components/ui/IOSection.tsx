import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { MarkdownJsonViewHeader } from "@/src/components/ui/MarkdownJsonView";
import { cn } from "@/src/utils/tailwind";

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
  /** Paint the body box. Off for bodies that carry their own tiles (media),
      which keep the box inset so they line up with boxed sections. */
  boxed?: boolean;
  children: React.ReactNode;
};

/**
 * One I/O section of the trace view: a header row (caret, title, hover
 * controls) over a boxed body. The caret hides the whole body; a collapsed
 * section does not render its children.
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
  boxed = true,
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
    <div className="group/iosection flex flex-col overflow-clip">
      <MarkdownJsonViewHeader
        title={title}
        titleIcon={titleIcon}
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
        hideCopyButton={!onCopy}
        hoverRevealControls
        controlButtons={controlButtons}
      />
      {!isCollapsed && (
        <div className="io-message-content ph-no-capture px-1 pt-1 pb-2">
          <div
            className={cn(
              "px-3 py-2",
              boxed && "bg-surface-output overflow-hidden rounded-md",
            )}
          >
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
