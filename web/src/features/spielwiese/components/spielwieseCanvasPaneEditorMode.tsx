import { CircleQuestionMark, Copy } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { Textarea } from "../ui/textarea";

export type CanvasEditorMode = "builder" | "json";

const canvasEditorModeToggleClassName =
  "inline-flex items-center gap-px rounded-[9px] bg-[#F7F7F7] p-px ring-1 ring-black/5";
const canvasEditorModeToggleButtonClassName =
  "text-foreground/62 hover:text-foreground inline-flex h-6 min-w-[6.25rem] items-center justify-center rounded-[8px] px-2.5 py-0 text-[11px] font-medium tracking-[0.01em] transition-colors outline-none focus-visible:ring-0";
const canvasEditorModeToggleButtonActiveClassName =
  "bg-white text-[#202427] shadow-[0_1px_2px_rgba(15,23,42,0.08)]";
const canvasJsonSkillCommandActionClassName =
  "text-foreground/68 hover:text-foreground inline-flex h-6 min-w-0 items-center gap-0 rounded-[8px] bg-transparent px-2 text-[11px] font-medium tracking-[0.01em] transition-colors outline-none focus-visible:ring-0 active:bg-transparent";
const canvasJsonSkillCommandTooltipClassName =
  "text-foreground/72 pointer-events-none invisible absolute top-full right-0 z-20 mt-2 w-[17rem] translate-y-1 rounded-[12px] bg-[rgba(255,255,255,0.98)] px-3 py-2 text-left text-[0.6875rem] leading-[1.05rem] font-normal opacity-0 shadow-[0_16px_40px_rgba(15,23,42,0.12),0_4px_14px_rgba(15,23,42,0.06)] backdrop-blur-sm transition-[opacity,transform] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] group-focus-within/json-skill-tooltip:pointer-events-auto group-focus-within/json-skill-tooltip:visible group-focus-within/json-skill-tooltip:translate-y-0 group-focus-within/json-skill-tooltip:opacity-100 group-hover/json-skill-tooltip:pointer-events-auto group-hover/json-skill-tooltip:visible group-hover/json-skill-tooltip:translate-y-0 group-hover/json-skill-tooltip:opacity-100";
const canvasJsonEditorClassName =
  "text-foreground min-h-0 flex-1 resize-none border-0 bg-transparent px-4 py-3 font-mono text-[12px] leading-5 shadow-none outline-none selection:bg-[rgba(72,123,164,0.16)] focus-visible:ring-0";

export function getCanvasJsonSkillInstallCommand(jsonValue: string) {
  return [
    "Create a prompt-workflow JSON array for the following canvas shape.",
    "Return only valid JSON. Do not wrap the answer in markdown or code fences.",
    'Each node must include: id, stepLabel, title, description, kind, optional layout ("composite" | "user-only" | "agent-only"), settings[], promptSections[], notes[], optional playgroundThinking, optional playgroundPreview.',
    "Use this current canvas as the reference format and evolve it for the task at hand:",
    jsonValue,
  ].join("\n\n");
}

function copyCanvasJsonSkillInstallCommand(jsonValue: string) {
  const command = getCanvasJsonSkillInstallCommand(jsonValue);

  return navigator.clipboard.writeText(command);
}

function CanvasJsonSkillCommand({ jsonValue }: { jsonValue: string }) {
  const onCopy = async () => {
    try {
      await copyCanvasJsonSkillInstallCommand(jsonValue);
    } catch {}
  };

  return (
    <div
      className={cn(
        "group/json-skill-command ml-px inline-flex items-center rounded-[8px] opacity-100",
      )}
      data-testid="spielwiese-canvas-json-skill-command"
    >
      <button
        aria-label="Copy Skill install command"
        className={canvasJsonSkillCommandActionClassName}
        data-testid="spielwiese-canvas-json-skill-command-button"
        onClick={() => {
          void onCopy();
        }}
        type="button"
      >
        <Copy className="text-foreground/46 size-3.5 shrink-0 stroke-[2.2px] active:scale-[0.86]" />
      </button>
      <div
        className="text-foreground/46 group/json-skill-tooltip relative inline-flex h-6 w-6 shrink-0 items-center justify-center outline-none after:absolute after:top-full after:right-0 after:h-2 after:w-[17rem] after:content-['']"
        data-testid="spielwiese-canvas-json-skill-command-info-affordance"
        tabIndex={0}
      >
        <CircleQuestionMark
          aria-hidden="true"
          className="size-3.5 shrink-0 stroke-[2.2px]"
        />
        <div
          className={canvasJsonSkillCommandTooltipClassName}
          data-testid="spielwiese-canvas-json-skill-command-tooltip"
          role="tooltip"
        >
          <p>
            Copy a prompt scaffold for any AI so it can generate valid canvas
            JSON for this editor. Paste the output here and continue refining it
            in the UI.{" "}
            <span className="inline cursor-pointer font-medium underline underline-offset-2">
              Docs
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

export function CanvasEditorModeToggle({
  activeMode,
  jsonValue,
  onModeChange,
}: {
  activeMode: CanvasEditorMode;
  jsonValue: string;
  onModeChange: (mode: CanvasEditorMode) => void;
}) {
  return (
    <div
      className={cn(canvasEditorModeToggleClassName, "overflow-hidden")}
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
      {activeMode === "json" ? (
        <CanvasJsonSkillCommand jsonValue={jsonValue} />
      ) : null}
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
