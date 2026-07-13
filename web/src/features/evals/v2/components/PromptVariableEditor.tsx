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
  WidgetType,
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

/** Right-side "×" that deletes the {{variable}} token from the prompt. */
class VariableDeleteWidget extends WidgetType {
  constructor(
    private readonly from: number,
    private readonly to: number,
  ) {
    super();
  }

  eq(other: VariableDeleteWidget) {
    return other.from === this.from && other.to === this.to;
  }

  toDOM(view: EditorView) {
    const button = document.createElement("span");
    button.className = "cm-eval-variable-delete";
    button.textContent = "×";
    button.title = "Remove variable";
    // Keep the caret where it is; deletion is the only effect.
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      view.dispatch({ changes: { from: this.from, to: this.to } });
      view.focus();
    });
    return button;
  }
}

// Pill styling for {{variable}} tokens — a left status icon (with the error
// on hover), the clickable variable body, and a right "×" delete control.
function createVariableHighlighter(
  getStatus: (variable: string) => VariableMappingStatus | undefined,
) {
  const decorator = new MatchDecorator({
    regexp: /{{\s*([\w.]+)\s*}}/g,
    decorate: (add, from, to, match) => {
      const status = getStatus(match[1]);
      add(
        from,
        to,
        Decoration.mark({
          class: `cm-eval-variable${status ? ` cm-eval-variable-${status.status}` : ""}`,
          attributes:
            status?.status === "invalid" && status.message
              ? { title: status.message }
              : undefined,
        }),
      );
      add(
        to,
        to,
        Decoration.widget({
          widget: new VariableDeleteWidget(from, to),
          side: 1,
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
  // Button-like pill split in two merged halves: the variable body (with a
  // status icon on its left edge) and a "×" delete control on the right.
  ".cm-eval-variable": {
    borderRadius: "6px 0 0 6px",
    padding: "1px 4px 1px 6px",
    cursor: "pointer",
    fontWeight: "600",
    whiteSpace: "nowrap",
  },
  ".cm-eval-variable-delete": {
    cursor: "pointer",
    padding: "1px 5px 1px 2px",
    borderRadius: "0 6px 6px 0",
    fontSize: "inherit",
    lineHeight: "inherit",
    userSelect: "none",
    webkitUserSelect: "none",
  },
  ".cm-eval-variable-delete:hover": {
    color: "#ef4444",
  },
  "&light .cm-eval-variable": {
    backgroundColor: "rgba(59, 130, 246, 0.14)",
    color: "#1d4ed8",
    border: "1px solid rgba(59, 130, 246, 0.45)",
    borderRight: "none",
    boxShadow: "0 1px 1px rgba(0, 0, 0, 0.05)",
  },
  "&light .cm-eval-variable:hover": {
    backgroundColor: "rgba(59, 130, 246, 0.25)",
  },
  "&light .cm-eval-variable-delete": {
    backgroundColor: "rgba(59, 130, 246, 0.14)",
    color: "rgba(29, 78, 216, 0.6)",
    border: "1px solid rgba(59, 130, 246, 0.45)",
    borderLeft: "none",
    boxShadow: "0 1px 1px rgba(0, 0, 0, 0.05)",
  },
  "&dark .cm-eval-variable": {
    backgroundColor: "rgba(96, 165, 250, 0.2)",
    color: "#93c5fd",
    border: "1px solid rgba(96, 165, 250, 0.5)",
    borderRight: "none",
  },
  "&dark .cm-eval-variable:hover": {
    backgroundColor: "rgba(96, 165, 250, 0.32)",
  },
  "&dark .cm-eval-variable-delete": {
    backgroundColor: "rgba(96, 165, 250, 0.2)",
    color: "rgba(147, 197, 253, 0.6)",
    border: "1px solid rgba(96, 165, 250, 0.5)",
    borderLeft: "none",
  },
  // Left status icon: connected (✓) or broken (!) — the error text itself is
  // in the mark's title attribute, shown on hover.
  ".cm-eval-variable-valid::before, .cm-eval-variable-invalid::before": {
    marginRight: "4px",
    fontWeight: "700",
  },
  ".cm-eval-variable-valid::before": {
    content: '"✓"',
    color: "#16a34a",
  },
  ".cm-eval-variable-invalid::before": {
    content: '"!"',
    color: "#ef4444",
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
  renderVariableContent,
  previewEnabled = false,
  onPreviewEnabledChange,
  showPreviewToggle = false,
  previewSlot,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Per-variable mapping health against the sample data — drives the pill dot. */
  variableStatus?: Record<string, VariableMappingStatus>;
  /** Popover body for the clicked variable (mapping controls). */
  renderVariableContent: (variable: string) => ReactNode;
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
    // The delete control removes the variable — no mapping popover for it.
    if ((event.target as HTMLElement).closest(".cm-eval-variable-delete")) {
      return;
    }
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos === null) return;
    const line = view.state.doc.lineAt(pos);
    const regex = /{{\s*([\w.]+)\s*}}/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(line.text)) !== null) {
      const from = line.from + match.index;
      const to = from + match[0].length;
      if (pos < from || pos > to) continue;
      const start = view.coordsAtPos(from);
      const end = view.coordsAtPos(to);
      if (!start) return;
      anchorRectRef.current = toDomRect({
        top: start.top,
        bottom: start.bottom,
        left: start.left,
        right: end?.right ?? start.right,
      });
      setActive({ variable: match[1], rect: anchorRectRef.current });
      return;
    }
  };

  // Serialized so the memo only invalidates when the status content changes;
  // an extensions identity change makes react-codemirror reconfigure the
  // editor, which re-runs the decorator with the fresh statuses.
  const statusKey = JSON.stringify(variableStatus ?? {});
  const extensions = useMemo(() => {
    const status: Record<string, VariableMappingStatus> = JSON.parse(statusKey);
    return [
      createVariableHighlighter((variable) => status[variable]),
      variableTheme,
      promptFontTheme,
      EditorView.domEventHandlers({
        click: (event, view) => handleClickRef.current(event, view),
      }),
    ];
  }, [statusKey]);

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
          minHeight={280}
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
            Preview with sample trace
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
          {active ? renderVariableContent(active.variable) : null}
        </PopoverContent>
      </Popover>
    </div>
  );
}
