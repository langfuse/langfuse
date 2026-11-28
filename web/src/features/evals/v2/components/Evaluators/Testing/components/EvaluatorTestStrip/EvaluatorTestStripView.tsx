import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { flushSync } from "react-dom";
import { ChevronDown, ChevronRight, Loader2 } from "@langfuse/icons";

import { Switch } from "@/src/components/design-system/Switch/Switch";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { EvaluatorTestResult } from "@/src/features/evals/v2/components/Evaluators/Testing/components/EvaluatorTestResult/EvaluatorTestResult";
import {
  TestResultTraceActionsDropdownMenu,
  TestResultTraceActionsTrigger,
} from "@/src/features/evals/v2/components/Evaluators/Testing/components/TestResultTraceActionsDropdownMenu/TestResultTraceActionsDropdownMenu";
import type { TestResultPanelState } from "@/src/features/evals/v2/components/Evaluators/Testing/components/TestResultPanelView/TestResultPanelView";
import { TestRunButton } from "@/src/features/evals/v2/components/Evaluators/Testing/components/TestRunButton/TestRunButton";

/** Pixels one arrow key press adds to or takes from the result. */
const RESIZE_KEY_STEP = 40;

/** A height the user gave the expanded strip, and the default height it returns to. */
export type TestResultSize = { height: number; defaultHeight: number };

/**
 * Bottom test row for the trace-detail sample view. The collapsed row keeps
 * Run test. The expanded result has no card border and a top edge that resizes it.
 */
export function EvaluatorTestStripView({
  open,
  onOpenChange,
  resultSize,
  onResultSizeChange,
  state,
  testResult,
  isPending,
  disabledReason,
  onRunTest,
  rawOpen,
  onRawOpenChange,
  executionTraceId,
  onOpenExecutionTrace,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null while the result keeps its default height. */
  resultSize: TestResultSize | null;
  onResultSizeChange: (size: TestResultSize | null) => void;
  state: TestResultPanelState;
  /** The raw test response; its variables and JSON view come from here. */
  testResult: unknown;
  isPending: boolean;
  /** Why a test cannot run; null when it can. */
  disabledReason: string | null;
  onRunTest: () => void;
  rawOpen: boolean;
  onRawOpenChange: (open: boolean) => void;
  /** Trace of the judge call, when the run produced one. */
  executionTraceId: string | null;
  onOpenExecutionTrace: (traceId: string) => void;
}) {
  const hasResult = state.status !== "empty" && state.status !== "running";
  const showResult = open && hasResult;
  const stripRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={stripRef}
      className="relative flex min-h-0 flex-col"
      style={
        showResult && resultSize ? { height: resultSize.height } : undefined
      }
    >
      {showResult ? (
        <ResizeHandle
          size={resultSize}
          onSizeChange={onResultSizeChange}
          getHeight={() => stripRef.current?.offsetHeight ?? 0}
        />
      ) : null}
      <div className="flex h-11 shrink-0 items-center gap-3 px-4">
        <TestToggle
          hasResult={hasResult}
          expanded={showResult}
          onToggle={() => onOpenChange(!open)}
        />
        {isPending ? (
          <Loader2
            size="base"
            color="muted"
            aria-label="Running test"
            __rawClassName="animate-spin"
          />
        ) : (
          <TestRunButton
            isPending={false}
            disabledReason={disabledReason}
            onRun={onRunTest}
            label="Run test"
            showIcon={false}
            size="md"
          />
        )}
        {hasResult ? (
          <span className="ml-auto flex shrink-0 items-center gap-2">
            <label className="text-muted-foreground flex cursor-pointer items-center gap-1.5 text-xs">
              <Switch
                size="sm"
                checked={rawOpen}
                onCheckedChange={onRawOpenChange}
              />
              Raw output
            </label>
            {executionTraceId ? (
              <TestResultTraceActionsDropdownMenu
                executionTraceId={executionTraceId}
                onOpenExecutionTrace={onOpenExecutionTrace}
              >
                {({ getTriggerProps }) => (
                  <TestResultTraceActionsTrigger {...getTriggerProps()} />
                )}
              </TestResultTraceActionsDropdownMenu>
            ) : null}
          </span>
        ) : null}
      </div>
      {open && state.status !== "empty" && state.status !== "running" ? (
        <EvaluatorTestResult
          state={state}
          testResult={testResult}
          rawOpen={rawOpen}
          fullReasoning={resultSize !== null}
        />
      ) : null}
    </div>
  );
}

/** Top edge of the expanded strip. Dragging it or pressing the arrow keys resizes the strip. */
function ResizeHandle({
  size,
  onSizeChange,
  getHeight,
}: {
  size: TestResultSize | null;
  onSizeChange: (size: TestResultSize | null) => void;
  /** The strip's height on screen. */
  getHeight: () => number;
}) {
  const dragRef = useRef<{
    startY: number;
    startHeight: number;
    defaultHeight: number;
  } | null>(null);

  const measure = () => {
    const height = getHeight();
    return { height, defaultHeight: size?.defaultHeight ?? height };
  };
  // Back at the default height the strip sizes itself to its content again.
  const setHeight = (height: number, defaultHeight: number) => {
    onSizeChange(height > defaultHeight ? { height, defaultHeight } : null);
  };
  // The panel caps how tall the strip gets, so keep the height it allowed.
  const resizeTo = (height: number, defaultHeight: number) => {
    flushSync(() => setHeight(height, defaultHeight));
    const shown = getHeight();
    if (shown < height) setHeight(shown, defaultHeight);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const { height, defaultHeight } = measure();
    dragRef.current = {
      startY: event.clientY,
      startHeight: height,
      defaultHeight,
    };
  };
  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    resizeTo(
      Math.round(drag.startHeight + drag.startY - event.clientY),
      drag.defaultHeight,
    );
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const { height, defaultHeight } = measure();
    const step = event.key === "ArrowUp" ? RESIZE_KEY_STEP : -RESIZE_KEY_STEP;
    resizeTo(height + step, defaultHeight);
  };

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize test result"
      aria-valuemin={0}
      aria-valuenow={size ? size.height - size.defaultHeight : 0}
      tabIndex={0}
      className="focus-visible:ring-ring absolute inset-x-0 -top-px flex h-px cursor-row-resize touch-none items-center justify-center after:absolute after:inset-x-0 after:-inset-y-1 focus-visible:ring-1 focus-visible:outline-hidden"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onLostPointerCapture={() => {
        dragRef.current = null;
      }}
      onKeyDown={handleKeyDown}
    >
      <div className="bg-border h-1 w-6 rounded-lg" />
    </div>
  );
}

/** Expands the result. Before a run there is nothing to expand, and it says so. */
function TestToggle({
  hasResult,
  expanded,
  onToggle,
}: {
  hasResult: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const content = (
    <>
      {expanded ? (
        <ChevronDown size="sm" color="muted" />
      ) : (
        <ChevronRight size="sm" color="muted" />
      )}
      Test
    </>
  );
  const className = "inline-flex items-center gap-1.5 text-sm font-bold";

  if (hasResult) {
    return (
      <button
        type="button"
        className={className}
        aria-expanded={expanded}
        onClick={onToggle}
      >
        {content}
      </button>
    );
  }

  return (
    <Tooltip label="Run a test to see the result">
      {({ getTriggerProps }) => (
        <button
          {...getTriggerProps()}
          type="button"
          className={`${className} cursor-default`}
          aria-disabled
          aria-expanded={false}
        >
          {content}
        </button>
      )}
    </Tooltip>
  );
}
