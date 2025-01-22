import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/src/components/ui/card";
import { cn } from "@/src/utils/tailwind";
import { diffWordsWithSpace } from "diff";

type DiffLine = {
  text: string;
  type: "unchanged" | "removed" | "added" | "empty";
  parts?: {
    value: string;
    type?: "removed" | "added";
  }[];
};

type DiffViewerProps = {
  oldString: string;
  newString: string;
  oldLabel?: string;
  newLabel?: string;
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
  empty: "bg-muted",
} as const;

const DiffViewer: React.FC<DiffViewerProps> = ({
  oldString,
  newString,
  oldLabel = "Original Version",
  newLabel = "New Version",
  className,
}) => {
  const [diffLines, setDiffLines] = useState<{
    left: DiffLine[];
    right: DiffLine[];
  }>({ left: [], right: [] });

  useEffect(() => {
    const oldLines = oldString.split("\n");
    const newLines = newString.split("\n");
    const left: DiffLine[] = [];
    const right: DiffLine[] = [];

    const maxLength = Math.max(oldLines.length, newLines.length);
    for (let i = 0; i < maxLength; i++) {
      const oldLine = oldLines[i] || "";
      const newLine = newLines[i] || "";

      if (oldLine === newLine) {
        left.push({ text: oldLine, type: "unchanged" });
        right.push({ text: newLine, type: "unchanged" });
      } else if (oldLine === "" || newLine === "") {
        left.push({ text: oldLine, type: oldLine ? "removed" : "empty" });
        right.push({
          text: newLine,
          type: newLine ? "added" : "empty",
          parts: newLine ? [{ value: newLine, type: "added" }] : undefined,
        });
      } else {
        const wordDiffs = diffWordsWithSpace(oldLine, newLine);
        const leftParts = wordDiffs.filter((part) => !part.added);
        const rightParts = wordDiffs.filter((part) => !part.removed);

        left.push({
          text: leftParts.map((p) => p.value).join(""),
          type: "removed",
          parts: leftParts.map((p) => ({
            value: p.value,
            type: p.removed ? "removed" : undefined,
          })),
        });
        right.push({
          text: rightParts.map((p) => p.value).join(""),
          type: "added",
          parts: rightParts.map((p) => ({
            value: p.value,
            type: p.added ? "added" : undefined,
          })),
        });
      }
    }

    setDiffLines({ left, right });
  }, [oldString, newString]);

  const LineContent: React.FC<{ line: DiffLine }> = ({ line }) => {
    const typeClasses = {
      unchanged: "",
      removed: DIFF_COLORS.removed.line,
      added: DIFF_COLORS.added.line,
      empty: DIFF_COLORS.empty,
    };

    return (
      <div
        className={cn(
          "whitespace-pre px-4 py-1 font-mono text-xs",
          typeClasses[line.type],
        )}
      >
        {line.parts
          ? line.parts.map((part, idx) => (
              <span
                key={idx}
                className={part.type ? DIFF_COLORS[part.type].text : undefined}
              >
                {part.value}
              </span>
            ))
          : line.text || "\u00A0"}
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
            <div className="border-r">
              <div className="border-b bg-muted px-4 py-2 text-xs font-semibold">
                {oldLabel}
              </div>
              <div className="overflow-x-auto">
                {diffLines.left.map((line, idx) => (
                  <LineContent key={`left-${idx}`} line={line} />
                ))}
              </div>
            </div>

            <div>
              <div className="border-b bg-muted px-4 py-2 text-xs font-semibold">
                {newLabel}
              </div>
              <div className="overflow-x-auto">
                {diffLines.right.map((line, idx) => (
                  <LineContent key={`right-${idx}`} line={line} />
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DiffViewer;
