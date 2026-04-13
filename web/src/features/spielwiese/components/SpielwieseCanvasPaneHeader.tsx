import { SpielwieseNodeActionButtons } from "./SpielwieseAgentNodeHeaderActions";
import {
  CanvasEditorModeToggle,
  type CanvasEditorMode,
} from "./spielwieseCanvasPaneEditorMode";

type SpielwieseCanvasPaneHeaderProps = {
  areAllCardsCompact: boolean;
  jsonValue: string;
  mode: CanvasEditorMode;
  onCloseSidePanels?: () => void;
  onModeChange: (mode: CanvasEditorMode) => void;
  onToggleAllCards: () => void;
};

export function SpielwieseCanvasPaneHeader({
  areAllCardsCompact,
  jsonValue,
  mode,
  onCloseSidePanels,
  onModeChange,
  onToggleAllCards,
}: SpielwieseCanvasPaneHeaderProps) {
  return (
    <div
      className="-mx-2 flex w-[calc(100%+1rem)] shrink-0 items-center justify-between gap-2 rounded-t-[var(--canvas-pane-inner-radius)] border-b border-black/5 bg-[rgba(251,251,251,0.82)] px-2 py-2 supports-[backdrop-filter]:bg-[rgba(251,251,251,0.72)] supports-[backdrop-filter]:backdrop-blur-md"
      data-testid="spielwiese-canvas-editor-mode-header"
    >
      <CanvasEditorModeToggle
        activeMode={mode}
        jsonValue={jsonValue}
        onModeChange={onModeChange}
      />
      <SpielwieseNodeActionButtons
        archiveButtonLabel="Archive canvas nodes"
        compactButtonLabel={`${
          areAllCardsCompact ? "Expand" : "Collapse"
        } all canvas cards`}
        containerTestId="spielwiese-canvas-pane-actions"
        isCompact={areAllCardsCompact}
        isPreviewFocused={false}
        onArchiveNode={() => {}}
        onTogglePreviewFocus={onCloseSidePanels}
        onToggleCompact={onToggleAllCards}
        previewButtonLabel="Close side panels"
      />
    </div>
  );
}
