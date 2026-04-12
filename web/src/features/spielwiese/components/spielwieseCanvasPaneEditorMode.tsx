import { cn } from "@/src/utils/tailwind";
import { Textarea } from "../ui/textarea";

export type CanvasEditorMode = "builder" | "json";

const canvasEditorModeToggleClassName =
  "inline-flex items-center gap-px rounded-[9px] bg-[#F7F7F7] p-px ring-1 ring-black/5";
const canvasEditorModeToggleButtonClassName =
  "text-foreground/62 hover:text-foreground inline-flex h-6 min-w-[6.25rem] items-center justify-center rounded-[8px] px-2.5 py-0 text-[11px] font-medium tracking-[0.01em] transition-colors outline-none focus-visible:ring-0";
const canvasEditorModeToggleButtonActiveClassName =
  "bg-white text-[#202427] shadow-[0_1px_2px_rgba(15,23,42,0.08)]";
const canvasJsonEditorClassName =
  "text-foreground min-h-0 flex-1 resize-none border-0 bg-transparent px-4 py-3 font-mono text-[12px] leading-5 shadow-none outline-none selection:bg-[rgba(72,123,164,0.16)] focus-visible:ring-0";

export function CanvasEditorModeToggle({
  activeMode,
  onModeChange,
}: {
  activeMode: CanvasEditorMode;
  onModeChange: (mode: CanvasEditorMode) => void;
}) {
  return (
    <div
      className={canvasEditorModeToggleClassName}
      data-testid="spielwiese-canvas-editor-mode-toggle"
    >
      {[
        { id: "builder", label: "Builder mode" },
        { id: "json", label: "JSON mode" },
      ].map((option) => {
        const isActive = option.id === activeMode;

        return (
          <button
            aria-label={option.label}
            aria-pressed={isActive}
            className={cn(
              canvasEditorModeToggleButtonClassName,
              isActive && canvasEditorModeToggleButtonActiveClassName,
            )}
            data-testid={`spielwiese-canvas-editor-mode-${option.id}`}
            key={option.id}
            onClick={() => onModeChange(option.id as CanvasEditorMode)}
            type="button"
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function CanvasJsonEditor({
  error,
  jsonValue,
  onJsonBlur,
  onJsonChange,
}: {
  error: string | null;
  jsonValue: string;
  onJsonBlur: () => void;
  onJsonChange: (value: string) => void;
}) {
  return (
    <div
      className="mx-2 mb-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px] border border-black/8 bg-[rgba(251,251,251,0.98)] shadow-[inset_0_1px_0_rgba(255,255,255,0.86)]"
      data-testid="spielwiese-canvas-json-editor"
    >
      <Textarea
        aria-label="Canvas JSON"
        autoCapitalize="off"
        autoCorrect="off"
        className={canvasJsonEditorClassName}
        data-testid="spielwiese-canvas-json-input"
        onBlur={onJsonBlur}
        onChange={(event) => onJsonChange(event.target.value)}
        rows={18}
        spellCheck={false}
        value={jsonValue}
      />
      {error ? (
        <div
          className="px-4 pb-3 text-[11px] leading-4 text-[#8C4D3F]"
          data-testid="spielwiese-canvas-json-error"
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}
