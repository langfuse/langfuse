import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/src/utils/tailwind";

type Change = {
  value: string;
  added: boolean;
  removed: boolean;
  count: number;
};

const generateHtmlFromChanges = (changes: Change[]) => {
  return changes.map((change, index) => {
    if (change.added) {
      // Added content (green background)
      return (
        <span key={index} style={{ backgroundColor: '#d4edda', color: 'green' }}>
          {change.value}
        </span>
      );
    } else if (change.removed) {
      // Removed content (red background)
      return (
        <span key={index} style={{ backgroundColor: '#f8d7da', color: 'red' }}>
          {change.value}
        </span>
      );
    } else {
      // Unchanged content (normal)
      return <span key={index}>{change.value}</span>;
    }
  });
};

export const PromptDiffsViewer = ({
  oldPromptText,
  newPromptText
}: {
  oldPromptText: string;
  newPromptText: string;
}) => {
  const { diffLines } = require('diff');
  const changes = diffLines(oldPromptText, newPromptText);
  return (
    <DiffsViewer changes={changes} title="Prompt Differences" />
  )
};

export function DiffsViewer(props: {
  changes: Change[];
  className?: string;
  defaultCollapsed?: boolean;
  scrollable?: boolean;
  title?: string;
}) {
  const [isCollapsed, setCollapsed] = useState(props.defaultCollapsed);
  const handleShowAll = () => setCollapsed(!isCollapsed);
  return (
    <div className={cn("max-w-full rounded-md border", props.className)}>
      {props.title ? (
        <div className="border-b px-3 py-1 text-xs font-medium">
          {props.title}
        </div>
      ) : undefined}
      <div className="flex gap-2">
        <code
          className={cn(
            "relative flex-1 whitespace-pre-wrap break-all px-4 py-3 font-mono text-xs",
            isCollapsed ? `line-clamp-6` : "block",
            props.scrollable ? "max-h-60 overflow-y-scroll" : undefined,
          )}
        >
         <code>{generateHtmlFromChanges(props.changes)}</code>
        </code>
        <div className="flex gap-2 py-2 pr-2">
          {props.defaultCollapsed ? (
            <Button variant="secondary" size="xs" onClick={handleShowAll}>
              {isCollapsed ? (
                <ChevronsUpDown className="h-3 w-3" />
              ) : (
                <ChevronsDownUp className="h-3 w-3" />
              )}
            </Button>
          ) : undefined}
        </div>
      </div>
    </div>
  );
}
