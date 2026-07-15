import { useMemo, useRef, type ReactNode } from "react";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  type ViewUpdate,
  type ReactCodeMirrorRef,
} from "@uiw/react-codemirror";

import { CodeMirrorEditor } from "@/src/components/editor";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import { Button } from "@/src/components/ui/button";

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

// Positions strictly inside a {{token}} snap to just after it — drops and
// insertions must never split an existing token.
function snapOutOfTokens(doc: string, pos: number): number {
  const regex = /{{\s*[\w.]+\s*}}/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(doc)) !== null) {
    const end = match.index + match[0].length;
    if (pos > match.index && pos < end) return end;
  }
  return pos;
}

// Pill styling for {{variable}} tokens — one clickable surface reading
// "{{variable}} → binding ▾": the binding and arrows render via ::after from
// the data-mapping attribute, keeping the pill a single element with a single
// hover state.
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
            "data-mapping": label,
            title: invalid
              ? (status.message ??
                "Not connected to the sample data — click to select data")
              : `Mapped to ${label} — click to change`,
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

// Broken-mapping pill state: amber with dashed borders — a hollow "fill me
// in" slot — with the binding suffix turned into a "select data" CTA.
const INVALID_BORDER = `1px dashed color-mix(in srgb, hsl(var(--dark-yellow)) 70%, transparent)`;
const INVALID_BACKGROUND = `color-mix(in srgb, hsl(var(--dark-yellow)) 7%, transparent)`;
const INVALID_BACKGROUND_HOVER = `color-mix(in srgb, hsl(var(--dark-yellow)) 16%, transparent)`;

// Lucide icons as CSS background images. The stroke color is baked in per
// light/dark theme because data-URI SVGs cannot read CSS variables; the
// hsl() values mirror globals.css.
const lucideImage = (path: string, strokeColor: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='${strokeColor}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='${path}'/></svg>`,
  )}")`;
// ChevronRight: the pill is a master-detail row — clicking it opens the
// mapping panel beside the prompt, so the disclosure arrow points there.
const CHEVRON_RIGHT = "m9 18 6-6-6-6";
// GripVertical as two columns of filled dots — lucide's stroke-dot version
// renders ~1px at pill size, far too faint for a grab handle.
const gripImage = (fillColor: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='${fillColor}'>` +
      [5, 12, 19]
        .flatMap((cy) => [9, 15].map((cx) => ({ cx, cy })))
        .map(({ cx, cy }) => `<circle cx='${cx}' cy='${cy}' r='2.4'/>`)
        .join("") +
      `</svg>`,
  )}")`;
// --muted-foreground light/dark
const CHEVRON_LIGHT = lucideImage(CHEVRON_RIGHT, "hsl(215.4, 16.3%, 46.9%)");
const CHEVRON_DARK = lucideImage(CHEVRON_RIGHT, "hsl(215, 20.2%, 65.1%)");
// --dark-yellow light/dark
const CHEVRON_INVALID_LIGHT = lucideImage(CHEVRON_RIGHT, "hsl(43, 96%, 40%)");
const CHEVRON_INVALID_DARK = lucideImage(
  CHEVRON_RIGHT,
  "hsl(53, 98.3%, 76.9%)",
);
// Grip in the pill's accent color (--primary-accent light/dark) so it reads
// as a handle, not a faded decoration.
const GRIP_LIGHT = gripImage("hsl(243, 75.4%, 58.6%)");
const GRIP_DARK = gripImage("hsl(246, 55%, 70%)");

const variableTheme = EditorView.baseTheme({
  // Button-like pill, one clickable surface: "{{variable}} → binding ▾".
  // inline-block so the pill can carry real button padding — a plain inline
  // span would clip its background into the neighboring lines.
  ".cm-eval-variable": {
    display: "inline-block",
    borderRadius: "6px",
    // Slim left inset: the grip handle should hug the pill's left edge.
    padding: "3px 10px 3px 4px",
    margin: "2px 0",
    // Explicit button typography (matches the default shadcn button size)
    // instead of inheriting the editor's smaller prose size.
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
    cursor: "pointer",
    fontWeight: "600",
    whiteSpace: "nowrap",
    boxShadow: "0 1px 2px rgba(0, 0, 0, 0.06)",
    color: "hsl(var(--primary-accent))",
    backgroundColor:
      "color-mix(in srgb, hsl(var(--primary-accent)) 12%, transparent)",
    border:
      "1px solid color-mix(in srgb, hsl(var(--primary-accent)) 45%, transparent)",
  },
  ".cm-eval-variable:hover": {
    backgroundColor:
      "color-mix(in srgb, hsl(var(--primary-accent)) 22%, transparent)",
  },
  // Left grip: drag handle for moving the pill within the prompt — mousedown
  // in this zone starts the explicit move handled in handleMouseDownRef.
  ".cm-eval-variable::before": {
    content: '""',
    display: "inline-block",
    width: "13px",
    height: "14px",
    marginRight: "5px",
    verticalAlign: "-2px",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "center",
    backgroundSize: "14px 14px",
    cursor: "grab",
  },
  "&light .cm-eval-variable::before": {
    backgroundImage: GRIP_LIGHT,
  },
  "&dark .cm-eval-variable::before": {
    backgroundImage: GRIP_DARK,
  },
  // The binding suffix "→ Input ›": the → points from the variable to the
  // data it pulls in, the trailing › is a disclosure indicator — clicking
  // the pill opens its mapping in the panel beside the prompt. A ::after
  // with attr() because CodeMirror marks cannot carry extra DOM — and it
  // keeps the whole pill one clickable surface.
  ".cm-eval-variable::after": {
    content: '" → " attr(data-mapping)',
    display: "inline-block",
    fontWeight: "400",
    color: "hsl(var(--muted-foreground))",
    paddingRight: "18px",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right center",
    backgroundSize: "14px 14px",
  },
  "&light .cm-eval-variable::after": {
    backgroundImage: CHEVRON_LIGHT,
  },
  "&dark .cm-eval-variable::after": {
    backgroundImage: CHEVRON_DARK,
  },
  // Broken mapping (errors or resolves empty against the sample): the whole
  // pill turns into a dashed amber slot and the binding suffix becomes a
  // bold "select data" CTA. The error text itself is in the mark's title
  // attribute, shown on hover. Declared after the base rules so the
  // equal-specificity invalid rules win.
  ".cm-eval-variable-invalid": {
    color: "hsl(var(--dark-yellow))",
    backgroundColor: INVALID_BACKGROUND,
    border: INVALID_BORDER,
  },
  ".cm-eval-variable-invalid:hover": {
    backgroundColor: INVALID_BACKGROUND_HOVER,
  },
  ".cm-eval-variable-invalid::after": {
    color: "hsl(var(--dark-yellow))",
    fontWeight: "600",
  },
  "&light .cm-eval-variable-invalid::after": {
    backgroundImage: CHEVRON_INVALID_LIGHT,
  },
  "&dark .cm-eval-variable-invalid::after": {
    backgroundImage: CHEVRON_INVALID_DARK,
  },
  // While grip-dragging, the caret is the drop indicator: a fat accent bar
  // with blinking suspended so it stays visible while aiming.
  "&.cm-eval-dragging .cm-cursorLayer": {
    animationName: "none",
  },
  "&.cm-eval-dragging .cm-cursor": {
    display: "block",
    borderLeftWidth: "3px",
    borderLeftColor: "hsl(var(--primary-accent))",
  },
  "&.cm-eval-dragging .cm-content": {
    cursor: "grabbing",
  },
  // The variable currently being mapped in the side panel.
  ".cm-eval-variable-active": {
    borderColor: "hsl(var(--primary-accent))",
    boxShadow:
      "0 0 0 2px color-mix(in srgb, hsl(var(--primary-accent)) 30%, transparent)",
  },
});

/**
 * Prompt editor with inline {{variable}} pills: variables are styled inside
 * the CodeMirror document, and clicking one activates it in the mapping
 * panel next to the editor (via onVariableClick).
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
  /** Called when a {{variable}} pill is clicked. */
  onVariableClick: (variable: string) => void;
  /** When true, render previewSlot instead of the editor (toolbar stays). */
  previewEnabled?: boolean;
  onPreviewEnabledChange?: (enabled: boolean) => void;
  showPreviewToggle?: boolean;
  /** Interpolated-prompt preview rendered in place of the editor. */
  previewSlot?: ReactNode;
}) {
  const editorRef = useRef<ReactCodeMirrorRef | null>(null);

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

  // Grip drag: mousedown on a pill's grip zone starts an explicit move —
  // while dragging, the caret tracks the pointer as the drop indicator, and
  // mouseup moves the {{variable}} text there. (The browser's native
  // drag-of-selected-text can't be used: it only starts from a selection
  // that existed before the press.)
  const handleMouseDownRef = useRef<
    (event: MouseEvent, view: EditorView) => boolean
  >(() => false);
  handleMouseDownRef.current = (event, view) => {
    if (event.button !== 0) return false;
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos === null) return false;
    const line = view.state.doc.lineAt(pos);
    const regex = /{{\s*([\w.]+)\s*}}/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(line.text)) !== null) {
      const from = line.from + match.index;
      const to = from + match[0].length;
      if (pos < from || pos > to) continue;
      const start = view.coordsAtPos(from);
      // Grip = the zone left of the first character (the ::before box).
      const inGripZone =
        start !== null &&
        event.clientX < start.left &&
        event.clientX > start.left - 30;
      if (!inGripZone) return false;

      event.preventDefault();
      // The caret is the drop indicator, and CodeMirror only renders it on a
      // focused editor — focus explicitly since preventDefault suppressed it.
      view.focus();
      view.dom.classList.add("cm-eval-dragging");
      const previousBodyCursor = document.body.style.cursor;
      document.body.style.cursor = "grabbing";
      const text = view.state.sliceDoc(from, to);
      // posAtCoords clamps out-of-editor coordinates to the nearest text
      // position, so drops must be gated on the pointer actually being over
      // the editor — otherwise releasing over the panel teleports the token.
      const posInsideEditor = (x: number, y: number) => {
        const rect = view.dom.getBoundingClientRect();
        if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom)
          return null;
        return view.posAtCoords({ x, y });
      };
      const onMove = (moveEvent: MouseEvent) => {
        const dropPos = posInsideEditor(moveEvent.clientX, moveEvent.clientY);
        if (dropPos !== null) {
          view.dispatch({
            selection: { anchor: dropPos },
            scrollIntoView: true,
          });
        }
      };
      const onUp = (upEvent: MouseEvent) => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        view.dom.classList.remove("cm-eval-dragging");
        document.body.style.cursor = previousBodyCursor;
        const rawPos = posInsideEditor(upEvent.clientX, upEvent.clientY);
        // Dropped outside the editor or back onto itself: nothing to move;
        // the ensuing click event still activates the pill in the panel.
        if (rawPos === null || (rawPos >= from && rawPos <= to)) return;
        const dropPos = snapOutOfTokens(view.state.doc.toString(), rawPos);
        view.dispatch({
          changes: [
            { from, to },
            { from: dropPos, insert: text },
          ],
          selection: {
            anchor: dropPos > to ? dropPos : dropPos + text.length,
          },
        });
        view.focus();
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      return true;
    }
    return false;
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
        mousedown: (event, view) => handleMouseDownRef.current(event, view),
      }),
    ];
  }, [statusKey, mappingsKey, activeVariable]);

  // Inserts a {{variable}} template at the cursor (replacing any selection)
  // and selects the placeholder name so the user can type over it. The new
  // variable is activated in the mapping panel right away — it starts
  // unmapped, so the panel shows the map-me callout while the user names it
  // (renames are followed upstream).
  const insertVariable = () => {
    const view = editorRef.current?.view;
    if (!view) return;
    let { from, to } = view.state.selection.main;
    // Never mangle or replace an existing {{token}}: if the selection touches
    // one (e.g. the caret sits inside a pill after clicking it), snap the
    // insertion point to just after that token instead.
    const doc = view.state.doc.toString();
    const regex = /{{\s*[\w.]+\s*}}/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(doc)) !== null) {
      const start = match.index;
      const end = match.index + match[0].length;
      if (from === start && to === end) {
        from = to = end;
      } else {
        if (from > start && from < end) from = end;
        if (to > start && to < end) to = end;
      }
    }
    if (to < from) to = from;
    const placeholder = "variable";
    view.dispatch({
      changes: { from, to, insert: `{{${placeholder}}}` },
      selection: { anchor: from + 2, head: from + 2 + placeholder.length },
    });
    view.focus();
    onVariableClick(placeholder);
  };

  return (
    <div className="flex flex-col">
      {/* Toolbar attached above the prompt; the editor's (or preview's) own
          top border draws the seam. Controls cluster on the right. */}
      <div className="bg-muted/50 flex items-center justify-end gap-1 rounded-t-md border border-b-0 px-1.5 py-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 font-mono text-[10px]"
          title="Add variable"
          disabled={previewEnabled}
          onClick={insertVariable}
        >
          {"{{x}}"}
        </Button>
        {showPreviewToggle && (
          <label className="text-muted-foreground flex cursor-pointer items-center gap-1.5 px-2 text-xs">
            <Switch
              size="sm"
              checked={previewEnabled}
              onCheckedChange={(checked) => onPreviewEnabledChange?.(checked)}
            />
            Preview with sample
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
          editorRef={editorRef}
          extensions={extensions}
          className="rounded-t-none text-sm"
        />
      )}
    </div>
  );
}
