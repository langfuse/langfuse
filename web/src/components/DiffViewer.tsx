import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/src/components/ui/card";
import { cn } from "@/src/utils/tailwind";
import { diffLines as calculateDiffLines, diffWords } from "diff";

type DiffSegmentPart = {
  value: string;
  type?: "unchanged" | "removed" | "added" | "empty";
};

type DiffSegment = {
  text: string;
  type: "unchanged" | "removed" | "added" | "empty";
  parts?: DiffSegmentPart[];
};

type DiffViewerProps = {
  oldString: string;
  newString: string;
  oldLabel?: string;
  newLabel?: string;
  oldSubLabel?: string;
  newSubLabel?: string;
  className?: string;
};

const DIFF_COLORS = {
  added: {
    text: "bg-green-500/30",
    line: "bg-green-500/10",
  },
  removed: {
    text: "bg-destructive/60",
    line: "bg-destructive/10",
  },
  unchanged: {
    text: "bg-muted",
    line: "bg-muted",
  },
  empty: {
    text: "bg-muted",
    line: "bg-muted",
  },
} as const;

/**
 * Calculates the diff between two segments, word by word.
 * @param oldString - The old string to compare
 * @param newString - The new string to compare
 * @returns The diff between the two strings
 */
const calculateSegmentDiff = (oldString: string, newString: string) => {
  const segmentChanges = diffWords(oldString, newString, {});
  const leftWords: DiffSegmentPart[] = [];
  const rightWords: DiffSegmentPart[] = [];

  for (let charIndex = 0; charIndex < segmentChanges.length; charIndex++) {
    const change = segmentChanges[charIndex];

    if (!change.added && !change.removed) {
      // not added or removed, so it's unchanged.
      leftWords.push({ value: change.value, type: "unchanged" });
      rightWords.push({ value: change.value, type: "unchanged" });
    } else if (change.removed) {
      // removed, so we need to check if there is an addition next.
      const nextChange = segmentChanges[charIndex + 1];
      const areThereMoreCharacterChanges = nextChange !== undefined;
      const addsCharacterNext =
        areThereMoreCharacterChanges && segmentChanges[charIndex + 1].added;
      if (addsCharacterNext) {
        // there is addition next so we can show it as an update.
        leftWords.push({ value: change.value, type: "removed" });
        rightWords.push({ value: nextChange.value, type: "added" });

        // skip the next change since we've already processed it.
        charIndex++;
      } else {
        // no addition next, so we can show it as a removal.
        leftWords.push({ value: change.value, type: "removed" });
        rightWords.push({ value: "", type: "empty" });
      }
    } else {
      // added, so we can show it as an addition.
      leftWords.push({ value: "", type: "empty" });
      rightWords.push({ value: change.value, type: "added" });
    }
  }

  return { leftWords, rightWords };
};

const DiffViewer: React.FC<DiffViewerProps> = ({
  oldString,
  newString,
  oldLabel = "Original Version",
  newLabel = "New Version",
  oldSubLabel,
  newSubLabel,
  className,
}) => {
  const [diffLines, setDiffLines] = useState<{
    left: DiffSegment[];
    right: DiffSegment[];
  }>({ left: [], right: [] });

  useEffect(() => {
    const left: DiffSegment[] = [];
    const right: DiffSegment[] = [];

    const lineChanges = calculateDiffLines(oldString, newString, {});

    for (let diffIndex = 0; diffIndex < lineChanges.length; diffIndex++) {
      const part = lineChanges[diffIndex];

      // No changes
      if (!part.added && !part.removed) {
        left.push({ text: part.value, type: "unchanged" });
        right.push({ text: part.value, type: "unchanged" });
      } else if (part.removed) {
        // removed, so we need to check if there is an addition next.
        const areThereMoreChanges = diffIndex < lineChanges.length - 1;
        const isThereAnAdditionNext =
          areThereMoreChanges && lineChanges[diffIndex + 1].added;
        if (isThereAnAdditionNext) {
          // there is another change and it's an addition, meaning there is a change in the segment.
          const { leftWords, rightWords } = calculateSegmentDiff(
            part.value,
            lineChanges[diffIndex + 1].value,
          );

          left.push({ parts: leftWords, text: "", type: "removed" });
          right.push({ parts: rightWords, text: "", type: "added" });
          diffIndex++;
        } else {
          // No addition next, meaning it's a removal of the part.
          left.push({ text: part.value, type: "removed" });
          right.push({ text: "", type: "empty" });
        }
      } else {
        // No removal before this part, meaning it's a new part.
        left.push({ text: "", type: "empty" });
        right.push({ text: part.value, type: "added" });
      }
    }

    setDiffLines({ left, right });
  }, [oldString, newString]);

  const DiffRow: React.FC<{
    leftLine: DiffSegment;
    rightLine: DiffSegment;
  }> = ({ leftLine, rightLine }) => {
    const typeClasses = {
      unchanged: "",
      removed: DIFF_COLORS.removed.line,
      added: DIFF_COLORS.added.line,
      empty: DIFF_COLORS.empty,
    };

    const renderContent = (line: DiffSegment) =>
      line.parts
        ? line.parts.map((part, idx) => (
            <span
              key={idx}
              className={part.type ? DIFF_COLORS[part.type].text : undefined}
            >
              {part.value}
            </span>
          ))
        : line.text || "\u00A0";

    return (
      <div className="grid grid-cols-2">
        <div
          className={cn(
            "whitespace-pre-wrap break-words border-r px-4 py-1 font-mono text-xs",
            typeClasses[leftLine.type],
          )}
        >
          {renderContent(leftLine)}
        </div>
        <div
          className={cn(
            "whitespace-pre-wrap break-words px-4 py-1 font-mono text-xs",
            typeClasses[rightLine.type],
          )}
        >
          {renderContent(rightLine)}
        </div>
      </div>
    );
  };

  if (oldString === newString) {
    return <div className="text-sm text-muted-foreground">No changes</div>;
  }

  return (
    <div className={cn("w-full", className)}>
      <Card>
        <CardContent className="p-0">
          <div className="grid grid-cols-2">
            <div className="flex flex-row gap-1 border-b border-r bg-muted px-4 py-2 text-xs font-semibold">
              {oldLabel}
              {oldSubLabel && (
                <div
                  className="truncate text-xs text-muted-foreground"
                  title={oldSubLabel}
                >
                  {oldSubLabel}
                </div>
              )}
            </div>
            <div className="flex flex-row gap-1 border-b bg-muted px-4 py-2 text-xs font-semibold">
              {newLabel}
              {newSubLabel && (
                <div
                  className="truncate text-xs text-muted-foreground"
                  title={newSubLabel}
                >
                  {newSubLabel}
                </div>
              )}
            </div>
          </div>
          <div>
            {diffLines.left.map((leftLine, idx) => (
              <DiffRow
                key={idx}
                leftLine={leftLine}
                rightLine={diffLines.right[idx]}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DiffViewer;
