/**
 * CollapsibleJSONSection - A reusable section component for JSON content
 *
 * Features:
 * - Fixed header that stays visible during scroll
 * - Max-height constraint with scrollable body
 * - Integrated search, collapse, and copy functionality
 * - Optional expansion state management via props
 * - Suitable for Input, Output, Metadata sections
 */

import { useState, useCallback } from "react";
import { cn } from "@/src/utils/tailwind";
import { type MediaReturnType } from "@/src/features/media/validation";
import { JSONViewer } from "./JSONViewer";

export interface CollapsibleJSONSectionProps {
  /** Section title (e.g., "Input", "Output", "Metadata") */
  title: string;

  /** JSON data to display */
  data: unknown;

  /** Maximum height of the section (e.g., "500px", "50vh") */
  maxHeight?: string;

  /** Background color for the JSON viewer */
  backgroundColor?: string;

  /** Enable search functionality */
  enableSearch?: boolean;

  /** Placeholder text for search input */
  searchPlaceholder?: string;

  /** Collapsed state (controlled) */
  collapsed?: boolean;

  /** Callback when collapse state changes (controlled) */
  onToggleCollapse?: () => void;

  /** Show loading skeleton */
  isLoading?: boolean;

  /** Show parsing skeleton (progressive rendering) */
  isParsing?: boolean;

  /** Media attachments to display */
  media?: MediaReturnType[];

  /** Additional control buttons in header */
  controlButtons?: React.ReactNode;

  /** Custom CSS classes for container */
  className?: string;

  /** Hide if data is null/undefined */
  hideIfNull?: boolean;
}

/**
 * CollapsibleJSONSection component
 *
 * A section wrapper for JSONViewer that provides:
 * - Fixed header with title and controls
 * - Scrollable body with max-height
 * - Consistent layout for Input/Output/Metadata sections
 */
export function CollapsibleJSONSection({
  title,
  data,
  maxHeight = "500px",
  backgroundColor,
  enableSearch = true,
  searchPlaceholder,
  collapsed,
  onToggleCollapse,
  isLoading = false,
  isParsing = false,
  media,
  controlButtons,
  className,
  hideIfNull = false,
}: CollapsibleJSONSectionProps) {
  // Internal collapse state (used when not controlled)
  const [internalCollapsed, setInternalCollapsed] = useState(false);

  // Determine if component is controlled
  const isControlled =
    collapsed !== undefined && onToggleCollapse !== undefined;
  const effectiveCollapsed = isControlled ? collapsed : internalCollapsed;

  // Handle collapse toggle
  const handleToggleCollapse = useCallback(() => {
    if (isControlled) {
      onToggleCollapse();
    } else {
      setInternalCollapsed(!internalCollapsed);
    }
  }, [isControlled, onToggleCollapse, internalCollapsed]);

  // Hide section if data is null and hideIfNull is true
  if (hideIfNull && !data) {
    return null;
  }

  return (
    <div
      className={cn("flex flex-col overflow-hidden", className)}
      style={{ maxHeight }}
    >
      {/* JSONViewer with all functionality */}
      <JSONViewer
        title={title}
        data={data}
        backgroundColor={backgroundColor}
        enableSearch={enableSearch}
        searchPlaceholder={searchPlaceholder}
        collapsed={effectiveCollapsed}
        onToggleCollapse={handleToggleCollapse}
        isLoading={isLoading}
        isParsing={isParsing}
        media={media}
        controlButtons={controlButtons}
        scrollable={true}
        className="h-full"
      />
    </div>
  );
}
