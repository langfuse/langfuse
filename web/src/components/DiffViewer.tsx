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
    const left: DiffLine[] = [];
    const right: DiffLine[] = [];

    // Get the complete diff first
    const changes = diffWordsWithSpace(oldString, newString, {});
    console.log(changes);

    // Group changes by line
    const oldParts: { value: string; type?: "removed" }[][] = [[]];
    const newParts: { value: string; type?: "added" }[][] = [[]];

    changes.forEach((part) => {
      const lines = part.value.split("\n");

      lines.forEach((line, idx) => {
        if (idx > 0) {
          if (!part.added) oldParts.push([]);
          if (!part.removed) newParts.push([]);
        }

        if (!part.added) {
          oldParts[oldParts.length - 1].push({
            value: line,
            type: part.removed ? "removed" : undefined,
          });
        }
        if (!part.removed) {
          newParts[newParts.length - 1].push({
            value: line,
            type: part.added ? "added" : undefined,
          });
        }
      });
    });

    // Convert parts to DiffLines
    const maxLength = Math.max(oldParts.length, newParts.length);
    for (let i = 0; i < maxLength; i++) {
      const oldLineParts = oldParts[i] || [];
      const newLineParts = newParts[i] || [];

      if (oldLineParts.length === 0 && newLineParts.length === 0) {
        left.push({ text: "", type: "empty" });
        right.push({ text: "", type: "empty" });
        continue;
      }

      const oldText = oldLineParts.map((p) => p.value).join("");
      const newText = newLineParts.map((p) => p.value).join("");

      if (oldText === newText) {
        left.push({ text: oldText, type: "unchanged" });
        right.push({ text: newText, type: "unchanged" });
      } else {
        left.push({
          text: oldText,
          type: oldText ? "removed" : "empty",
          parts: oldLineParts.length ? oldLineParts : undefined,
        });
        right.push({
          text: newText,
          type: newText ? "added" : "empty",
          parts: newLineParts.length ? newLineParts : undefined,
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
