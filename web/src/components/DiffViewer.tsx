import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/src/components/ui/card";
import { cn } from "@/src/utils/tailwind";
import { diffLines as calculateDiffLines, diffWords } from "diff";
import { useVirtualizer } from "@tanstack/react-virtual";

type DiffSegmentPart = {
  value: string;
  type?: "unchanged" | "removed" | "added" | "empty";
};

type DiffSegment = {
  text: string;
  type: "unchanged" | "removed" | "added" | "empty";
  parts?: DiffSegmentPart[];
};

type DiffRow = {
  left?: DiffSegment;
  right?: DiffSegment;
  combined?: DiffSegment;
};

type DiffViewerProps = {
  oldString: string;
  newString: string;
  oldLabel?: string;
  newLabel?: string;
  oldSubLabel?: string;
  newSubLabel?: string;
  className?: string;
  viewType?: "split" | "combined";
  size?: "xs" | "sm" | "md" | "lg";
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

const transformToRows = (
  left: DiffSegment[],
  right: DiffSegment[],
  viewType: "split" | "combined",
): DiffRow[] => {
  if (viewType === "split") {
    return left.map((leftSeg, idx) => ({
      left: leftSeg,
      right: right[idx],
    }));
  }

  // Combined mode: sequential rows, skip empty segments
  const rows: DiffRow[] = [];
  for (let i = 0; i < left.length; i++) {
    const leftSeg = left[i];
    const rightSeg = right[i];

    if (leftSeg.type !== "empty") {
      rows.push({ combined: leftSeg });
    }
    if (rightSeg.type !== "empty" && rightSeg.type !== leftSeg.type) {
      rows.push({ combined: rightSeg });
    }
  }
  return rows;
};

const SIZE_MAP = {
  xs: "max-h-[400px]",
  sm: "max-h-[600px]",
  md: "max-h-[800px]",
  lg: "max-h-[1000px]",
} as const;

const DiffViewer: React.FC<DiffViewerProps> = ({
  oldString,
  newString,
  oldLabel = "Original Version",
  newLabel = "New Version",
  oldSubLabel,
  newSubLabel,
  className,
  viewType = "split",
  size = "sm",
}) => {
  const [diffLines, setDiffLines] = useState<{
    left: DiffSegment[];
    right: DiffSegment[];
  }>({ left: [], right: [] });

  const parentRef = useRef<HTMLDivElement>(null);

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

  const rows = useMemo(
    () => transformToRows(diffLines.left, diffLines.right, viewType),
    [diffLines, viewType],
  );

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 24,
    overscan: 10,
  });

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

  const renderRow = (row: DiffRow) => {
    if (viewType === "split" && row.left && row.right) {
      return (
        <div className="grid grid-cols-2">
          <div
            className={cn(
              "whitespace-pre-wrap break-words border-r px-4 py-1 font-mono text-xs",
              typeClasses[row.left.type],
            )}
          >
            {renderContent(row.left)}
          </div>
          <div
            className={cn(
              "whitespace-pre-wrap break-words px-4 py-1 font-mono text-xs",
              typeClasses[row.right.type],
            )}
          >
            {renderContent(row.right)}
          </div>
        </div>
      );
    }

    if (viewType === "combined" && row.combined) {
      return (
        <div
          className={cn(
            "whitespace-pre-wrap break-words px-4 py-1 font-mono text-xs",
            typeClasses[row.combined.type],
          )}
        >
          {renderContent(row.combined)}
        </div>
      );
    }

    return null;
  };

  if (oldString === newString) {
    return <div className="text-sm text-muted-foreground">No changes</div>;
  }

  return (
    <div className={cn("w-full", className)}>
      <Card>
        <CardContent className="p-0">
          {viewType === "split" ? (
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
          ) : (
            <div className="flex flex-row gap-1 border-b bg-muted px-4 py-2 text-xs font-semibold">
              {oldLabel} → {newLabel}
            </div>
          )}
          <div ref={parentRef} className={cn(SIZE_MAP[size], "overflow-auto")}>
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: "100%",
                position: "relative",
              }}
            >
              {virtualizer.getVirtualItems().map((virtualItem) => (
                <div
                  key={virtualItem.key}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${virtualItem.size}px`,
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  {renderRow(rows[virtualItem.index])}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DiffViewer;
