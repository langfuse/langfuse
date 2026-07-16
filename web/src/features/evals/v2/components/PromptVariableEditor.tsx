import { useMemo, useRef, type ReactNode } from "react";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  type ViewUpdate,
} from "@uiw/react-codemirror";

import { CodeMirrorEditor } from "@/src/components/editor";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import { cn } from "@/src/utils/tailwind";

// Prompts are prose, not code: use the app font instead of the editor's
// monospace default (which lives on .cm-scroller), and match the text inset
// of the neighboring form controls (px-3 triggers) instead of the editor's
// narrow code gutter padding.
const promptFontTheme = EditorView.theme({
  ".cm-scroller": { fontFamily: "inherit" },
  ".cm-content": { padding: "8px 0" },
  ".cm-line": { padding: "0 12px" },
});

/** Mapping health of a variable against the selected sample data. */
export type VariableMappingStatus = {
  status: "valid" | "invalid";
  /** Error shown on hover when the variable is not connected to the data. */
  message?: string;
};

// Safety net for pathological labels; the mapping labels themselves are
// already collapsed to "root › … › leaf" upstream (formatMappingLabel).
function truncateLabel(label: string, max = 36): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

// Linter-style token highlighting for {{variable}}: healthy variables are
// plain accent-colored mono text, broken/unmapped ones get an amber wavy
// underline (the universal "there's a problem here" editor idiom). The
// binding itself lives in the step-3 card — here it only appears in the
// hover title, plus click-to-jump.
function createVariableHighlighter(
  getStatus: (variable: string) => VariableMappingStatus | undefined,
  getMappingLabel: (variable: string) => string | undefined,
  isActive: (variable: string) => boolean,
) {
  const decorator = new MatchDecorator({
    regexp: /{{\s*([\w.]+)\s*}}/g,
    decorate: (add, from, to, match) => {
      const status = getStatus(match[1]);
      const invalid = status?.status === "invalid";
      const label = truncateLabel(getMappingLabel(match[1]) ?? "map data");
      add(
        from,
        to,
        Decoration.mark({
          class: `cm-eval-variable${status ? ` cm-eval-variable-${status.status}` : ""}${isActive(match[1]) ? " cm-eval-variable-active" : ""}`,
          attributes: {
            title: invalid
              ? (status.message ??
                "Not connected to the sample data — click to open its mapping")
              : `Pulls from ${label} — click to open its mapping`,
          },
        }),
      );
    },
  });
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = decorator.createDeco(view);
      }
      update(update: ViewUpdate) {
        this.decorations = decorator.updateDeco(update, this.decorations);
      }
    },
    { decorations: (v) => v.decorations },
  );
}

const variableTheme = EditorView.baseTheme({
  // Syntax-highlighted token, not a widget: mono accent text that stays in
  // the prose flow. The pointer cursor is the only hint it's clickable.
  ".cm-eval-variable": {
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
    fontSize: "0.8125rem",
    fontWeight: "600",
    color: "hsl(var(--primary-accent))",
    borderRadius: "3px",
    cursor: "pointer",
  },
  ".cm-eval-variable:hover": {
    backgroundColor:
      "color-mix(in srgb, hsl(var(--primary-accent)) 10%, transparent)",
  },
  // Broken mapping (unmapped, errors, or resolves empty against the sample):
  // amber with a wavy underline, like a linter warning. The error text
  // itself is in the mark's title attribute, shown on hover.
  ".cm-eval-variable-invalid": {
    color: "hsl(var(--dark-yellow))",
    textDecorationLine: "underline",
    textDecorationStyle: "wavy",
    textDecorationColor:
      "color-mix(in srgb, hsl(var(--dark-yellow)) 80%, transparent)",
    textDecorationThickness: "1px",
    textUnderlineOffset: "3px",
  },
  ".cm-eval-variable-invalid:hover": {
    backgroundColor:
      "color-mix(in srgb, hsl(var(--dark-yellow)) 10%, transparent)",
  },
  // The variable whose mapping card is open in step 3.
  ".cm-eval-variable-active": {
    backgroundColor:
      "color-mix(in srgb, hsl(var(--primary-accent)) 12%, transparent)",
  },
});

/**
 * Prompt editor with syntax-highlighted {{variable}} tokens: healthy
 * variables render as accent mono text, broken ones as linter-style amber
 * wavy underlines. Clicking a token opens its mapping card in step 3
 * (via onVariableClick) — no widget chrome in the text flow.
 */
export function PromptVariableEditor({
  value,
  onChange,
  variableStatus,
  variableMappings,
  activeVariable,
  onVariableClick,
  previewEnabled = false,
  onPreviewEnabledChange,
  showPreviewToggle = false,
  previewDisabledReason = null,
  previewSlot,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Per-variable mapping health against the sample data — drives the pill's
      broken-mapping state. */
  variableStatus?: Record<string, VariableMappingStatus>;
  /** Per-variable display label of the current data binding (e.g. "Input"),
      shown inside the pill next to the variable name. */
  variableMappings?: Record<string, string>;
  /** The variable being mapped in the side panel — its pill gets a ring. */
  activeVariable?: string | null;
  /** Called when a {{variable}} token is clicked (reveal, not edit). */
  onVariableClick: (variable: string) => void;
  /** When true, render previewSlot instead of the editor (toolbar stays). */
  previewEnabled?: boolean;
  onPreviewEnabledChange?: (enabled: boolean) => void;
  showPreviewToggle?: boolean;
  /** Non-null disables the preview toggle, with this as the tooltip hint. */
  previewDisabledReason?: string | null;
  /** Interpolated-prompt preview rendered in place of the editor. */
  previewSlot?: ReactNode;
}) {
  // Click handling lives inside CodeMirror (domEventHandlers) so no extra
  // interactive wrapper element is needed. Routed through a ref so the
  // memoized extensions array keeps a stable identity (react-codemirror
  // reconfigures the editor whenever `extensions` changes by reference).
  const handleClickRef = useRef<(event: MouseEvent, view: EditorView) => void>(
    () => undefined,
  );
  handleClickRef.current = (event, view) => {
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos === null) return;
    const line = view.state.doc.lineAt(pos);
    const regex = /{{\s*([\w.]+)\s*}}/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(line.text)) !== null) {
      const from = line.from + match.index;
      const to = from + match[0].length;
      if (pos < from || pos > to) continue;
      onVariableClick(match[1]);
      return;
    }
  };

  // Serialized so the memo only invalidates when the content changes; an
  // extensions identity change makes react-codemirror reconfigure the editor,
  // which re-runs the decorator with the fresh statuses/labels.
  const statusKey = JSON.stringify(variableStatus ?? {});
  const mappingsKey = JSON.stringify(variableMappings ?? {});
  const extensions = useMemo(() => {
    const status: Record<string, VariableMappingStatus> = JSON.parse(statusKey);
    const mappingLabels: Record<string, string> = JSON.parse(mappingsKey);
    return [
      createVariableHighlighter(
        (variable) => status[variable],
        (variable) => mappingLabels[variable],
        (variable) => variable === activeVariable,
      ),
      variableTheme,
      promptFontTheme,
      EditorView.domEventHandlers({
        click: (event, view) => handleClickRef.current(event, view),
      }),
    ];
  }, [statusKey, mappingsKey, activeVariable]);

  return (
    <div className="flex flex-col">
      {/* Toolbar attached above the prompt; the editor's (or preview's) own
          top border draws the seam. */}
      <div className="bg-muted/50 flex items-center justify-end gap-1 rounded-t-md border border-b-0 px-1.5 py-1">
        {showPreviewToggle && (
          <label
            className={cn(
              "text-muted-foreground flex h-6 items-center gap-1.5 px-2 text-xs leading-none font-normal",
              previewDisabledReason
                ? "cursor-not-allowed opacity-60"
                : "cursor-pointer",
            )}
            title={previewDisabledReason ?? undefined}
          >
            <Switch
              size="sm"
              checked={previewEnabled}
              disabled={Boolean(previewDisabledReason)}
              onCheckedChange={(checked) => onPreviewEnabledChange?.(checked)}
            />
            Preview
          </label>
        )}
      </div>

      {previewEnabled && previewSlot ? (
        previewSlot
      ) : (
        <CodeMirrorEditor
          value={value}
          onChange={onChange}
          editable
          mode="prompt"
          // Low enough that typical prompts hug their content — a tall fixed
          // min-height leaves a dead strip under the last line that reads as
          // broken bottom padding.
          minHeight={140}
          maxHeight="50dvh"
          lineNumbers={false}
          extensions={extensions}
          className="rounded-t-none text-sm"
        />
      )}
    </div>
  );
}
