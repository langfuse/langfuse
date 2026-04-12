import { type RefObject, useRef } from "react";
import type { ResizablePanelHandle } from "../ui/resizable";

function getEvaluationOverflowInPixels(shellElement: HTMLDivElement | null) {
  if (!shellElement) {
    return 0;
  }

  return Math.max(shellElement.scrollHeight - shellElement.clientHeight, 0);
}

function expandBottomPaneToFitEvaluation({
  bottomPanelRef,
  extraBottomSpace = 8,
  shellElement,
}: {
  bottomPanelRef: RefObject<ResizablePanelHandle | null>;
  extraBottomSpace?: number;
  shellElement: HTMLDivElement | null;
}) {
  const overflowInPixels = getEvaluationOverflowInPixels(shellElement);
  const bottomPanel = bottomPanelRef.current;

  if (!bottomPanel || overflowInPixels <= 0) {
    return;
  }

  bottomPanel.resize(
    bottomPanel.getSize().inPixels + overflowInPixels + extraBottomSpace,
  );
}

function scheduleBottomPaneFit({
  bottomPanelRef,
  evaluationShellRef,
}: {
  bottomPanelRef: RefObject<ResizablePanelHandle | null>;
  evaluationShellRef: RefObject<HTMLDivElement | null>;
}) {
  window.setTimeout(() => {
    expandBottomPaneToFitEvaluation({
      bottomPanelRef,
      shellElement: evaluationShellRef.current,
    });
  }, 0);
}

export function useEvaluationPaneFit() {
  const bottomPanelRef = useRef<ResizablePanelHandle | null>(null);
  const evaluationShellRef = useRef<HTMLDivElement | null>(null);
  const requestBottomPaneFit = () =>
    scheduleBottomPaneFit({
      bottomPanelRef,
      evaluationShellRef,
    });

  return {
    bottomPanelRef,
    evaluationShellRef,
    requestBottomPaneFit,
  };
}
