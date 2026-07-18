import React, {
  Fragment,
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Card, CardContent } from "@/src/components/ui/card";
import { cn } from "@/src/utils/tailwind";
import { diffLines as calculateDiffLines, diffWords } from "diff";

type LineType = "unchanged" | "removed" | "added" | "empty";

type WordPart = {
  value: string;
  type: "unchanged" | "removed" | "added";
};

type DiffCell = {
  type: LineType;
  text: string;
  parts?: WordPart[];
  lineNumber?: number;
};

type DiffRow = {
  left: DiffCell;
  right: DiffCell;
};

type DiffViewerProps = {
  oldString: string;
  newString: string;
  oldLabel?: string;
  newLabel?: string;
  oldSubLabel?: string;
  newSubLabel?: string;
  className?: string;
  /**
   * When true, the scroll area fills the height it is given by its parent
   * (via `h-full`/`min-h-0`) instead of capping at `max-h-[78vh]`. Use this
   * when the viewer is placed inside an already-constrained, flex container
   * (e.g. a dialog body) so it does not introduce a second, nested scrollbar.
   */
  fillContainerHeight?: boolean;
};

const DIFF_COLORS = {
  added: {
    word: "bg-green-500/30",
    line: "bg-green-500/10",
    gutter: "bg-green-500/10",
  },
  removed: {
    word: "bg-destructive/40",
    line: "bg-destructive/10",
    gutter: "bg-destructive/10",
  },
  unchanged: {
    word: "",
    line: "",
    gutter: "",
  },
  empty: {
    word: "",
    line: "bg-muted/40",
    gutter: "bg-muted/40",
  },
} as const;

const EMPTY_CELL: DiffCell = { type: "empty", text: "" };

// The diff grid is rendered as a flat list of cells: one header row plus four
// cells per content row. These constants let us map a row index back to its DOM
// cell so the overview ruler can read each row's real pixel position.
const GRID_COLUMNS = 4;
const HEADER_CELLS = 4;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

type ChangeKind = "added" | "removed" | "modified";

type ChangeSegment = {
  startRow: number;
  endRow: number; // exclusive
  kind: ChangeKind;
};

type ChangeMarker = {
  startFraction: number;
  endFraction: number;
  kind: ChangeKind;
};

/**
 * Classifies a single diff row for the overview ruler: an in-place change
 * (deletion on the left + addition on the right) is "modified", a left-only
 * deletion is "removed", a right-only addition is "added", and an unchanged row
 * is null.
 */
const rowChangeKind = (row: DiffRow): ChangeKind | null => {
  const leftRemoved = row.left.type === "removed";
  const rightAdded = row.right.type === "added";

  if (leftRemoved && rightAdded) return "modified";
  if (leftRemoved) return "removed";
  if (rightAdded) return "added";
  return null;
};

/**
 * Splits a diff segment into individual lines. `diffLines` keeps the trailing
 * newline as part of the segment value, which would otherwise produce a
 * spurious empty line at the end, so we drop it.
 */
const splitLines = (value: string): string[] => {
  if (value === "") return [];
  const lines = value.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
};

/**
 * Computes a word-level diff for a single changed line so we can highlight the
 * exact words that changed within an otherwise similar line.
 */
const computeWordDiff = (
  oldLine: string,
  newLine: string,
): { leftWords: WordPart[]; rightWords: WordPart[] } => {
  const changes = diffWords(oldLine, newLine, {});
  const leftWords: WordPart[] = [];
  const rightWords: WordPart[] = [];

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];

    if (!change.added && !change.removed) {
      leftWords.push({ value: change.value, type: "unchanged" });
      rightWords.push({ value: change.value, type: "unchanged" });
    } else if (change.removed) {
      const next = changes[i + 1];
      if (next?.added) {
        leftWords.push({ value: change.value, type: "removed" });
        rightWords.push({ value: next.value, type: "added" });
        i++;
      } else {
        leftWords.push({ value: change.value, type: "removed" });
      }
    } else {
      rightWords.push({ value: change.value, type: "added" });
    }
  }

  return { leftWords, rightWords };
};

/**
 * Builds an aligned, line-by-line side-by-side diff so each source line gets its
 * own row and stable line number, mirroring the VS Code diff layout.
 */
const buildDiffRows = (oldString: string, newString: string): DiffRow[] => {
  const rows: DiffRow[] = [];
  const lineChanges = calculateDiffLines(oldString, newString, {});

  let leftLineNumber = 0;
  let rightLineNumber = 0;

  for (let i = 0; i < lineChanges.length; i++) {
    const part = lineChanges[i];

    if (!part.added && !part.removed) {
      for (const line of splitLines(part.value)) {
        leftLineNumber++;
        rightLineNumber++;
        rows.push({
          left: { type: "unchanged", text: line, lineNumber: leftLineNumber },
          right: { type: "unchanged", text: line, lineNumber: rightLineNumber },
        });
      }
      continue;
    }

    if (part.removed) {
      const next = lineChanges[i + 1];
      const isChangeBlock = Boolean(next?.added);

      if (isChangeBlock) {
        const leftLines = splitLines(part.value);
        const rightLines = splitLines(next.value);
        const maxLines = Math.max(leftLines.length, rightLines.length);

        for (let j = 0; j < maxLines; j++) {
          const leftLine = leftLines[j];
          const rightLine = rightLines[j];

          if (leftLine !== undefined && rightLine !== undefined) {
            const { leftWords, rightWords } = computeWordDiff(
              leftLine,
              rightLine,
            );
            leftLineNumber++;
            rightLineNumber++;
            rows.push({
              left: {
                type: "removed",
                text: leftLine,
                parts: leftWords,
                lineNumber: leftLineNumber,
              },
              right: {
                type: "added",
                text: rightLine,
                parts: rightWords,
                lineNumber: rightLineNumber,
              },
            });
          } else if (leftLine !== undefined) {
            leftLineNumber++;
            rows.push({
              left: {
                type: "removed",
                text: leftLine,
                lineNumber: leftLineNumber,
              },
              right: EMPTY_CELL,
            });
          } else if (rightLine !== undefined) {
            rightLineNumber++;
            rows.push({
              left: EMPTY_CELL,
              right: {
                type: "added",
                text: rightLine,
                lineNumber: rightLineNumber,
              },
            });
          }
        }

        i++; // skip the paired addition
      } else {
        for (const line of splitLines(part.value)) {
          leftLineNumber++;
          rows.push({
            left: { type: "removed", text: line, lineNumber: leftLineNumber },
            right: EMPTY_CELL,
          });
        }
      }
      continue;
    }

    // Pure addition
    for (const line of splitLines(part.value)) {
      rightLineNumber++;
      rows.push({
        left: EMPTY_CELL,
        right: { type: "added", text: line, lineNumber: rightLineNumber },
      });
    }
  }

  return rows;
};

const renderCellContent = (cell: DiffCell): React.ReactNode => {
  if (cell.parts) {
    return cell.parts.map((part, idx) => (
      <span
        key={idx}
        className={
          part.type === "unchanged" ? undefined : DIFF_COLORS[part.type].word
        }
      >
        {part.value}
      </span>
    ));
  }

  // Use a non-breaking space so empty lines still occupy a row height.
  return cell.text === "" ? "\u00A0" : cell.text;
};

const DiffViewer: React.FC<DiffViewerProps> = ({
  oldString,
  newString,
  oldLabel = "Original Version",
  newLabel = "New Version",
  oldSubLabel,
  newSubLabel,
  className,
  fillContainerHeight = false,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const scrollId = useId();

  const [scrollMetrics, setScrollMetrics] = useState({
    scrollTop: 0,
    scrollHeight: 0,
    clientHeight: 0,
  });
  const [markers, setMarkers] = useState<ChangeMarker[]>([]);

  const rows = useMemo(
    () => buildDiffRows(oldString, newString),
    [oldString, newString],
  );

  // Group consecutive changed rows of the *same* kind. Only the row indices are
  // computed here; the pixel positions are measured from the DOM so the markers
  // line up with the real (wrapped) row heights.
  const segments = useMemo<ChangeSegment[]>(() => {
    const result: ChangeSegment[] = [];

    let i = 0;
    while (i < rows.length) {
      const kind = rowChangeKind(rows[i]);
      if (kind === null) {
        i++;
        continue;
      }

      const start = i;
      while (i < rows.length && rowChangeKind(rows[i]) === kind) {
        i++;
      }

      result.push({ startRow: start, endRow: i, kind });
    }

    return result;
  }, [rows]);

  const syncScrollMetrics = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setScrollMetrics({
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    });
  }, []);

  // Measure each change segment's actual pixel offset within the scroll content
  // so the overview markers map to where the change really is, accounting for
  // line wrapping and variable row heights.
  const measure = useCallback(() => {
    const scrollEl = scrollRef.current;
    const gridEl = gridRef.current;
    if (!scrollEl || !gridEl) return;

    setScrollMetrics({
      scrollTop: scrollEl.scrollTop,
      scrollHeight: scrollEl.scrollHeight,
      clientHeight: scrollEl.clientHeight,
    });

    // Markers are stored as a fraction of the FULL content height. The ruler
    // element's height spans the viewport and its track represents the whole
    // document, so rendering each marker with a percentage `top`/`height`
    // relative to the ruler scales the fraction onto the ruler's pixel height.
    // This keeps markers spread across the entire ruler no matter how much taller
    // the content is than the viewport — i.e. no compression for large diffs.
    const contentHeight = gridEl.scrollHeight || 1;
    const gridTop = gridEl.getBoundingClientRect().top;
    const cells = gridEl.children;

    const nextMarkers: ChangeMarker[] = [];
    for (const segment of segments) {
      const startCell = cells[HEADER_CELLS + segment.startRow * GRID_COLUMNS];
      const endCell = cells[HEADER_CELLS + (segment.endRow - 1) * GRID_COLUMNS];
      if (!startCell || !endCell) continue;

      const top = startCell.getBoundingClientRect().top - gridTop;
      const bottom = endCell.getBoundingClientRect().bottom - gridTop;

      nextMarkers.push({
        startFraction: clamp01(top / contentHeight),
        endFraction: clamp01(bottom / contentHeight),
        kind: segment.kind,
      });
    }

    setMarkers(nextMarkers);
  }, [segments]);

  useLayoutEffect(() => {
    measure();
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (gridRef.current) observer.observe(gridRef.current);
    return () => observer.disconnect();
  }, [measure]);

  const scrollToClientY = useCallback((clientY: number) => {
    const el = scrollRef.current;
    const ruler = rulerRef.current;
    if (!el || !ruler) return;
    const rect = ruler.getBoundingClientRect();
    const fraction = Math.min(
      1,
      Math.max(0, (clientY - rect.top) / rect.height),
    );
    const maxScroll = el.scrollHeight - el.clientHeight;
    el.scrollTop = Math.min(
      maxScroll,
      Math.max(0, fraction * el.scrollHeight - el.clientHeight / 2),
    );
  }, []);

  // Center a given content pixel position in the viewport.
  const scrollToContentY = useCallback((contentY: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const maxScroll = el.scrollHeight - el.clientHeight;
    el.scrollTop = Math.min(
      maxScroll,
      Math.max(0, contentY - el.clientHeight / 2),
    );
  }, []);

  // Keyboard equivalent of clicking the ruler: jump to the next/previous change.
  const jumpToAdjacentMarker = useCallback(
    (direction: 1 | -1) => {
      const el = scrollRef.current;
      if (!el || markers.length === 0) return;
      const positions = markers
        .map((marker) => marker.startFraction * el.scrollHeight)
        .sort((a, b) => a - b);
      const reference = el.scrollTop + el.clientHeight / 2;

      let target: number | undefined;
      if (direction === 1) {
        const next = positions.find((position) => position > reference + 1);
        if (next === undefined) {
          el.scrollTop = el.scrollHeight;
          return;
        }
        target = next;
      } else {
        for (let i = positions.length - 1; i >= 0; i--) {
          if (positions[i] < reference - 1) {
            target = positions[i];
            break;
          }
        }
        if (target === undefined) {
          el.scrollTop = 0;
          return;
        }
      }

      scrollToContentY(target);
    },
    [markers, scrollToContentY],
  );

  const handleRulerKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const el = scrollRef.current;
      if (!el) return;

      switch (event.key) {
        case "ArrowDown":
        case "ArrowRight":
          event.preventDefault();
          jumpToAdjacentMarker(1);
          break;
        case "ArrowUp":
        case "ArrowLeft":
          event.preventDefault();
          jumpToAdjacentMarker(-1);
          break;
        case "PageDown":
          event.preventDefault();
          el.scrollTop += el.clientHeight * 0.9;
          break;
        case "PageUp":
          event.preventDefault();
          el.scrollTop -= el.clientHeight * 0.9;
          break;
        case "Home":
          event.preventDefault();
          el.scrollTop = 0;
          break;
        case "End":
          event.preventDefault();
          el.scrollTop = el.scrollHeight;
          break;
        default:
          break;
      }
    },
    [jumpToAdjacentMarker],
  );

  const handleRulerPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      // preventDefault() above suppresses the compat mousedown event that
      // browsers use to move keyboard focus, so focus the ruler explicitly to
      // keep the "click to jump, then arrow-step through changes" flow working
      // without requiring a separate Tab. preventScroll avoids a redundant
      // scroll-into-view since the ruler is already in the viewport.
      event.currentTarget.focus({ preventScroll: true });
      isDraggingRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      scrollToClientY(event.clientY);
    },
    [scrollToClientY],
  );

  const handleRulerPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current) return;
      scrollToClientY(event.clientY);
    },
    [scrollToClientY],
  );

  const handleRulerPointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      isDraggingRef.current = false;
      // On pointercancel the capture is implicitly released and the pointer is
      // no longer active, so guard to avoid a NotFoundError from a redundant
      // release.
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [],
  );

  if (oldString === newString) {
    return (
      <div
        className={cn(
          "text-muted-foreground text-sm",
          // When the viewer is asked to fill its container, center the message
          // so the reserved space reads as an intentional empty state instead
          // of a blank region with a stray line of text at the top.
          fillContainerHeight && "flex items-center justify-center",
          className,
        )}
      >
        No changes
      </div>
    );
  }

  const hasOverflow =
    scrollMetrics.scrollHeight > scrollMetrics.clientHeight + 1;
  const thumbTop = scrollMetrics.scrollHeight
    ? (scrollMetrics.scrollTop / scrollMetrics.scrollHeight) * 100
    : 0;
  const thumbHeight = scrollMetrics.scrollHeight
    ? (scrollMetrics.clientHeight / scrollMetrics.scrollHeight) * 100
    : 100;

  return (
    <div
      className={cn(
        "w-full",
        fillContainerHeight && "flex min-h-0 flex-col",
        className,
      )}
    >
      <Card
        className={cn(
          fillContainerHeight && "flex min-h-0 flex-1 flex-col overflow-hidden",
        )}
      >
        <CardContent
          className={cn("p-0", fillContainerHeight && "min-h-0 flex-1")}
        >
          <div className={cn("flex", fillContainerHeight && "h-full min-h-0")}>
            <div
              ref={scrollRef}
              id={scrollId}
              onScroll={syncScrollMetrics}
              className={cn(
                "no-native-scrollbar flex-1 overflow-auto",
                fillContainerHeight ? "h-full min-h-0" : "max-h-[78vh]",
              )}
            >
              <div
                ref={gridRef}
                className="grid"
                style={{
                  gridTemplateColumns: "min-content 1fr min-content 1fr",
                }}
              >
                {/* Header */}
                <div className="bg-muted border-b" />
                <div className="bg-muted flex flex-row gap-1 border-r border-b px-3 py-2 text-xs font-semibold">
                  {oldLabel}
                  {oldSubLabel && (
                    <span
                      className="text-muted-foreground truncate text-xs font-normal"
                      title={oldSubLabel}
                    >
                      {oldSubLabel}
                    </span>
                  )}
                </div>
                <div className="bg-muted border-b" />
                <div className="bg-muted flex flex-row gap-1 border-b px-3 py-2 text-xs font-semibold">
                  {newLabel}
                  {newSubLabel && (
                    <span
                      className="text-muted-foreground truncate text-xs font-normal"
                      title={newSubLabel}
                    >
                      {newSubLabel}
                    </span>
                  )}
                </div>

                {/* Rows */}
                {rows.map((row, idx) => (
                  <Fragment key={idx}>
                    <div
                      className={cn(
                        "text-muted-foreground border-border/50 border-r px-2 py-0.5 text-right font-mono text-xs tabular-nums select-none",
                        DIFF_COLORS[row.left.type].gutter,
                      )}
                    >
                      {row.left.lineNumber ?? "\u00A0"}
                    </div>
                    <div
                      className={cn(
                        "border-r px-3 py-0.5 font-mono text-xs wrap-break-word whitespace-pre-wrap",
                        DIFF_COLORS[row.left.type].line,
                      )}
                    >
                      {renderCellContent(row.left)}
                    </div>
                    <div
                      className={cn(
                        "text-muted-foreground border-border/50 border-r px-2 py-0.5 text-right font-mono text-xs tabular-nums select-none",
                        DIFF_COLORS[row.right.type].gutter,
                      )}
                    >
                      {row.right.lineNumber ?? "\u00A0"}
                    </div>
                    <div
                      className={cn(
                        "px-3 py-0.5 font-mono text-xs wrap-break-word whitespace-pre-wrap",
                        DIFF_COLORS[row.right.type].line,
                      )}
                    >
                      {renderCellContent(row.right)}
                    </div>
                  </Fragment>
                ))}
              </div>
            </div>

            {/* Change overview ruler */}
            <div
              ref={rulerRef}
              role="scrollbar"
              aria-label="Diff change overview"
              aria-controls={scrollId}
              aria-orientation="vertical"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(thumbTop)}
              tabIndex={hasOverflow ? 0 : -1}
              onPointerDown={handleRulerPointerDown}
              onPointerMove={handleRulerPointerMove}
              onPointerUp={handleRulerPointerUp}
              onPointerCancel={handleRulerPointerUp}
              onKeyDown={handleRulerKeyDown}
              className={cn(
                "bg-muted/40 focus-visible:ring-ring relative w-6 shrink-0 border-l outline-none focus-visible:ring-2 focus-visible:ring-inset",
                hasOverflow ? "cursor-pointer" : "cursor-default",
              )}
              title="Jump to changes (Arrow keys to step, PageUp/PageDown to scroll)"
            >
              {markers.map((marker, idx) => {
                const markerStyle = {
                  top: `${marker.startFraction * 100}%`,
                  height: `${Math.max(
                    (marker.endFraction - marker.startFraction) * 100,
                    0.8,
                  )}%`,
                  minHeight: "3px",
                };

                // A modified block is a deletion on the left and an addition on
                // the right, so show both colors split down the middle.
                if (marker.kind === "modified") {
                  return (
                    <div
                      key={idx}
                      className="absolute inset-x-0 flex overflow-hidden"
                      style={markerStyle}
                    >
                      <div className="bg-destructive/80 flex-1" />
                      <div className="flex-1 bg-green-500/80" />
                    </div>
                  );
                }

                return (
                  <div
                    key={idx}
                    className={cn(
                      "absolute inset-x-0",
                      marker.kind === "added"
                        ? "bg-green-500/80"
                        : "bg-destructive/80",
                    )}
                    style={markerStyle}
                  />
                );
              })}
              {hasOverflow && (
                <div
                  className="border-foreground/20 bg-foreground/10 hover:bg-foreground/20 absolute inset-x-0 border-y transition-colors"
                  style={{
                    top: `${thumbTop}%`,
                    height: `${thumbHeight}%`,
                  }}
                />
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DiffViewer;
