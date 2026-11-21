import { type ReactNode, useId, useState } from "react";

import { ExpandToggle } from "@/src/components/design-system/ExpandToggle/ExpandToggle";

export function RoleAuthSetupSection({ children }: { children: ReactNode }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const contentId = useId();

  return (
    <div className="flex flex-col gap-3">
      <ExpandToggle
        expanded={isExpanded}
        onExpandedChange={setIsExpanded}
        label="Show AWS setup"
        expandedLabel="Hide AWS setup"
        variant="icon"
        size="sm"
        controls={contentId}
      />
      <div id={contentId} hidden={!isExpanded}>
        {children}
      </div>
    </div>
  );
}
