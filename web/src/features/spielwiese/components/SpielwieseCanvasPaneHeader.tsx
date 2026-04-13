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
      className="flex shrink-0 items-center justify-between gap-2 px-2 pt-2 pb-1"
      data-testid="spielwiese-canvas-editor-mode-header"
    >
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
      <CanvasEditorModeToggle
        activeMode={mode}
        jsonValue={jsonValue}
        onModeChange={onModeChange}
      />
    </div>
  );
}
