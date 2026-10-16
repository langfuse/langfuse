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
  /** Shown after the title, outside the toggle (e.g. an info tooltip). */
  titleAside?: React.ReactNode;
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
  /** Vertical box padding: `sm` for bodies whose rows carry their own padding
      (tables), `lg` for tiles that want the same inset on every side (media). */
  bodyPadding?: "sm" | "md" | "lg";
  children: React.ReactNode;
};

/**
 * One I/O section of the trace view: a header row (caret, title, hover
 * controls) over a boxed body. The header row toggles the body (its controls
 * do not); a collapsed section is just the header row and does not render
 * its children.
 */
export function IOSection({
  title,
  titleText,
  titleIcon,
  titleAside,
  onCopy,
  controlButtons,
  defaultCollapsed = false,
  collapsed,
  onCollapsedChange,
  boxed = true,
  bodyPadding = "md",
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
        titleAside={titleAside}
        flush
        leading={
          <Caret
            className="icon-base text-icon-foreground shrink-0"
            aria-hidden
          />
        }
        toggle={{
          expanded: !isCollapsed,
          label: `${isCollapsed ? "Expand" : "Collapse"} ${label}`,
          onToggle: toggle,
        }}
        handleOnCopy={onCopy}
        // A collapsed section offers nothing to copy or act on.
        hideCopyButton={!onCopy || isCollapsed}
        hoverRevealControls
        controlButtons={isCollapsed ? undefined : controlButtons}
      />
      {!isCollapsed && (
        <div className="io-message-content ph-no-capture pt-1">
          {boxed ? (
            <div
              className={cn(
                "bg-surface-section overflow-hidden rounded-md px-3",
                bodyPadding === "sm" && "py-1",
                bodyPadding === "md" && "py-2",
                bodyPadding === "lg" && "py-3",
              )}
            >
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
