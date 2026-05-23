import { SpielwieseNodeActionButtons } from "./SpielwieseAgentNodeHeaderActions";
import {
  CanvasEditorModeToggle,
  type CanvasEditorMode,
} from "./spielwieseCanvasPaneEditorMode";
import { spielwieseCanvasPaneHeaderClassName } from "./spielwieseCanvasPaneChrome";

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
      className={spielwieseCanvasPaneHeaderClassName}
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
        isPreviewButtonInert
        isPreviewFocused={false}
        onArchiveNode={() => {}}
        onTogglePreviewFocus={onCloseSidePanels}
        onToggleCompact={onToggleAllCards}
        previewButtonLabel="Close side panels"
      />
    </div>
  );
}
