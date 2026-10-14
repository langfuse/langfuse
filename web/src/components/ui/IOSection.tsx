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
  /** Off for bodies that bring their own box (status messages, toned tables). */
  boxed?: boolean;
  children: React.ReactNode;
};

/**
 * One I/O section of the trace view: a header row (caret, title, hover
 * controls) over a boxed body. The caret hides the whole body; a collapsed
 * section is just the header row and does not render its children.
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
    // overflow-clip (not hidden) so the sticky header can track the panel scroll.
    <div className="group/iosection flex flex-col overflow-clip">
      <MarkdownJsonViewHeader
        title={title}
        titleIcon={titleIcon}
        flush
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
        <div className="io-message-content ph-no-capture pt-1">
          {boxed ? (
            <div className="bg-surface-section overflow-hidden rounded-md px-3 py-2">
              {children}
            </div>
          ) : (
            children
          )}
        </div>
      )}
    </div>
  );
}
