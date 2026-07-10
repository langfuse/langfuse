import { useMemo, useRef, useState, type ReactNode } from "react";
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
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/src/components/ui/popover";

/** Mapping health of a variable against the selected sample data. */
export type VariableMappingStatus = "valid" | "invalid";

// Pill styling for {{variable}} tokens — rendered inline in the editor and
// clickable to open the mapping popover. Each pill carries an optional status
// class that renders a green/red dot for the mapping health.
function createVariableHighlighter(
  getStatus: (variable: string) => VariableMappingStatus | undefined,
) {
  const decorator = new MatchDecorator({
    regexp: /{{\s*([\w.]+)\s*}}/g,
    decoration: (match) => {
      const status = getStatus(match[1]);
      return Decoration.mark({
        class: `cm-eval-variable${status ? ` cm-eval-variable-${status}` : ""}`,
      });
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
  ".cm-eval-variable": {
    borderRadius: "4px",
    padding: "1px 3px",
    cursor: "pointer",
    fontWeight: "500",
  },
  "&light .cm-eval-variable": {
    backgroundColor: "rgba(59, 130, 246, 0.12)",
    color: "#1d4ed8",
    border: "1px solid rgba(59, 130, 246, 0.25)",
  },
  "&dark .cm-eval-variable": {
    backgroundColor: "rgba(96, 165, 250, 0.18)",
    color: "#93c5fd",
    border: "1px solid rgba(96, 165, 250, 0.3)",
  },
  ".cm-eval-variable-valid::after, .cm-eval-variable-invalid::after": {
    content: '""',
    display: "inline-block",
    width: "6px",
    height: "6px",
    borderRadius: "9999px",
    marginLeft: "4px",
    verticalAlign: "middle",
  },
  ".cm-eval-variable-valid::after": {
    backgroundColor: "#22c55e",
  },
  ".cm-eval-variable-invalid::after": {
    backgroundColor: "#ef4444",
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
}: {
  value: string;
  onChange: (value: string) => void;
  /** Per-variable mapping health against the sample data — drives the pill dot. */
  variableStatus?: Record<string, VariableMappingStatus>;
  /** Popover body for the clicked variable (mapping controls). */
  renderVariableContent: (variable: string) => ReactNode;
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
      EditorView.domEventHandlers({
        click: (event, view) => handleClickRef.current(event, view),
      }),
    ];
  }, [statusKey]);

  return (
    <div className="relative">
      <CodeMirrorEditor
        value={value}
        onChange={onChange}
        editable
        mode="prompt"
        minHeight={280}
        maxHeight="50dvh"
        editorRef={editorRef}
        extensions={extensions}
      />
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
