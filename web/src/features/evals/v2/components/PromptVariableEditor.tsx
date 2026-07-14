import { useMemo, useRef, useState, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
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
import { Button } from "@/src/components/ui/button";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/src/components/ui/popover";
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

// Keep long JSONPath bindings from blowing up the pill; CSS cannot ellipsize
// just the middle of the ::after content, so the label is shortened here.
function truncateLabel(label: string, max = 24): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

// Pill styling for {{variable}} tokens — one clickable surface reading
// "{{variable}} → binding ▾": the binding and arrows render via ::after from
// the data-mapping attribute, keeping the pill a single element with a single
// hover state.
function createVariableHighlighter(
  getStatus: (variable: string) => VariableMappingStatus | undefined,
  getMappingLabel: (variable: string) => string | undefined,
) {
  const decorator = new MatchDecorator({
    regexp: /{{\s*([\w.]+)\s*}}/g,
    decorate: (add, from, to, match) => {
      const status = getStatus(match[1]);
      const invalid = status?.status === "invalid";
      const label = invalid
        ? "select data"
        : truncateLabel(getMappingLabel(match[1]) ?? "map data");
      add(
        from,
        to,
        Decoration.mark({
          class: `cm-eval-variable${status ? ` cm-eval-variable-${status.status}` : ""}`,
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

// Lucide ChevronDown (the app-wide dropdown arrow) as a CSS background image.
// The stroke color is baked in per light/dark theme because data-URI SVGs
// cannot read CSS variables; the hsl() values mirror globals.css.
const chevronDownImage = (strokeColor: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='${strokeColor}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='m6 9 6 6 6-6'/></svg>`,
  )}")`;
// --muted-foreground light/dark
const CHEVRON_LIGHT = chevronDownImage("hsl(215.4, 16.3%, 46.9%)");
const CHEVRON_DARK = chevronDownImage("hsl(215, 20.2%, 65.1%)");
// --dark-yellow light/dark
const CHEVRON_INVALID_LIGHT = chevronDownImage("hsl(43, 96%, 40%)");
const CHEVRON_INVALID_DARK = chevronDownImage("hsl(53, 98.3%, 76.9%)");

const variableTheme = EditorView.baseTheme({
  // Button-like pill, one clickable surface: "{{variable}} → binding ▾".
  // inline-block so the pill can carry real button padding — a plain inline
  // span would clip its background into the neighboring lines.
  ".cm-eval-variable": {
    display: "inline-block",
    borderRadius: "6px",
    padding: "3px 10px",
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
  // The binding suffix "→ Input ⌄": the → points from the variable to the
  // data it pulls in, the trailing chevron (the app-wide lucide ChevronDown,
  // as a background image) signals that clicking opens a picker. A ::after
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
});

type ActiveVariable = {
  variable: string;
  rect: DOMRect;
};

function toDomRect(coords: {
  top: number;
  bottom: number;
  left: number;
  right: number;
}): DOMRect {
  return {
    top: coords.top,
    bottom: coords.bottom,
    left: coords.left,
    right: coords.right,
    width: coords.right - coords.left,
    height: coords.bottom - coords.top,
    x: coords.left,
    y: coords.top,
    toJSON: () => ({}),
  } as DOMRect;
}

/**
 * Prompt editor with inline {{variable}} pills: variables are styled inside
 * the CodeMirror document, and clicking one opens a popover (anchored to the
 * clicked token) with the per-variable mapping controls.
 */
export function PromptVariableEditor({
  value,
  onChange,
  variableStatus,
  variableMappings,
  renderVariableContent,
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
  /** Popover body for the clicked variable (mapping controls). `close`
      dismisses the popover, e.g. when handing off to the sample panel. */
  renderVariableContent: (variable: string, close: () => void) => ReactNode;
  /** When true, render previewSlot instead of the editor (toolbar stays). */
  previewEnabled?: boolean;
  onPreviewEnabledChange?: (enabled: boolean) => void;
  showPreviewToggle?: boolean;
  /** Interpolated-prompt preview rendered in place of the editor. */
  previewSlot?: ReactNode;
}) {
  const editorRef = useRef<ReactCodeMirrorRef | null>(null);
  const [active, setActive] = useState<ActiveVariable | null>(null);

  // The anchor rect is virtual: it tracks the last clicked {{variable}} token.
  const anchorRectRef = useRef<DOMRect>(
    toDomRect({
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
    }),
  );
  const virtualAnchorRef = useRef({
    getBoundingClientRect: () => anchorRectRef.current,
  });

  // Click handling lives inside CodeMirror (domEventHandlers) so no extra
  // interactive wrapper element is needed. Routed through a ref so the
  // memoized extensions array keeps a stable identity (react-codemirror
  // reconfigures the editor whenever `extensions` changes by reference).
  const handleClickRef = useRef<(event: MouseEvent, view: EditorView) => void>(
    () => undefined,
  );
  handleClickRef.current = (event, view) => {
    const openForRange = (variable: string, from: number, to: number) => {
      const start = view.coordsAtPos(from);
      if (!start) return;
      const end = view.coordsAtPos(to);
      anchorRectRef.current = toDomRect({
        top: start.top,
        bottom: start.bottom,
        left: start.left,
        right: end?.right ?? start.right,
      });
      setActive({ variable, rect: anchorRectRef.current });
    };

    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos === null) return;
    const line = view.state.doc.lineAt(pos);
    const regex = /{{\s*([\w.]+)\s*}}/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(line.text)) !== null) {
      const from = line.from + match.index;
      const to = from + match[0].length;
      if (pos < from || pos > to) continue;
      openForRange(match[1], from, to);
      return;
    }
  };

  // Serialized so the memo only invalidates when the content changes; an
  // extensions identity change makes react-codemirror reconfigure the editor,
  // which re-runs the decorator with the fresh statuses/colors.
  const statusKey = JSON.stringify(variableStatus ?? {});
  const mappingsKey = JSON.stringify(variableMappings ?? {});
  const extensions = useMemo(() => {
    const status: Record<string, VariableMappingStatus> = JSON.parse(statusKey);
    const mappingLabels: Record<string, string> = JSON.parse(mappingsKey);
    return [
      createVariableHighlighter(
        (variable) => status[variable],
        (variable) => mappingLabels[variable],
      ),
      variableTheme,
      promptFontTheme,
      EditorView.domEventHandlers({
        click: (event, view) => handleClickRef.current(event, view),
      }),
    ];
  }, [statusKey, mappingsKey]);

  // Inserts a {{variable}} template at the cursor (replacing any selection)
  // and selects the placeholder name so the user can type over it.
  const insertVariable = () => {
    const view = editorRef.current?.view;
    if (!view) return;
    const { from, to } = view.state.selection.main;
    const placeholder = "variable";
    view.dispatch({
      changes: { from, to, insert: `{{${placeholder}}}` },
      selection: { anchor: from + 2, head: from + 2 + placeholder.length },
    });
    view.focus();
  };

  return (
    <div className="flex flex-col gap-2">
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
          className="rounded-b-none text-sm"
        />
      )}

      {/* Toolbar attached below the prompt, left-aligned. The preview brings
          its own frame, so the toolbar detaches into a standalone bar there. */}
      <div
        className={cn(
          "bg-muted/50 flex items-center gap-2 border px-1.5 py-1",
          previewEnabled ? "rounded-md" : "-mt-2 rounded-b-md border-t-0",
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          disabled={previewEnabled}
          onClick={insertVariable}
        >
          <span className="mr-1.5 font-mono text-[10px]">{"{{x}}"}</span>
          Add variable
        </Button>
        {showPreviewToggle && (
          <Button
            type="button"
            variant={previewEnabled ? "secondary" : "ghost"}
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => onPreviewEnabledChange?.(!previewEnabled)}
          >
            {previewEnabled ? (
              <EyeOff className="mr-1.5 h-3.5 w-3.5" />
            ) : (
              <Eye className="mr-1.5 h-3.5 w-3.5" />
            )}
            Preview with sample observation
          </Button>
        )}
      </div>

      <Popover
        open={Boolean(active)}
        onOpenChange={(open) => {
          if (!open) setActive(null);
        }}
      >
        <PopoverAnchor virtualRef={virtualAnchorRef} />
        <PopoverContent className="w-96" align="start">
          {active
            ? renderVariableContent(active.variable, () => setActive(null))
            : null}
        </PopoverContent>
      </Popover>
    </div>
  );
}
