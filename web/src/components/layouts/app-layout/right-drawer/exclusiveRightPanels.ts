export type ExclusiveRightPanel = "assistant" | "support" | "migration";

const closers = new Map<ExclusiveRightPanel, () => void>();

/** Register this panel's close so another right-hand panel can dismiss it. */
export function registerExclusiveRightPanel(
  panel: ExclusiveRightPanel,
  close: () => void,
): () => void {
  closers.set(panel, close);
  return () => {
    if (closers.get(panel) === close) {
      closers.delete(panel);
    }
  };
}

/** Close every other registered right-hand panel. Call this when opening. */
export function occupyExclusiveRightPanel(panel: ExclusiveRightPanel): void {
  for (const [id, close] of closers) {
    if (id !== panel) {
      close();
    }
  }
}

export function resetExclusiveRightPanelsForTests(): void {
  closers.clear();
}
