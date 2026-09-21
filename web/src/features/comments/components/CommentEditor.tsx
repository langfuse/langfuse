import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  type AriaAttributes,
} from "react";
import CodeMirror, {
  EditorView,
  type ReactCodeMirrorRef,
} from "@uiw/react-codemirror";
import { Prec } from "@codemirror/state";
import { commentEditorMentions } from "./CommentEditorMentions";

export type CommentEditorHandle = {
  focus: () => void;
  getCursorPosition: () => number;
  getCursorRect: () => DOMRect;
  replaceRange: (from: number, to: number, text: string) => void;
};

type CommentEditorProps = {
  id?: string;
  "aria-invalid"?: AriaAttributes["aria-invalid"];
  "aria-describedby"?: string;
  value: string;
  onChange: (value: string) => void;
  onCursorChange?: (offset: number) => void;
  onKeyDown?: (event: KeyboardEvent) => boolean;
  disabled?: boolean;
  autoFocus?: boolean;
};

const basicSetup = {
  lineNumbers: false,
  foldGutter: false,
  highlightActiveLine: false,
  highlightActiveLineGutter: false,
  highlightSelectionMatches: false,
  searchKeymap: false,
  autocompletion: false,
  bracketMatching: false,
  closeBrackets: false,
};

const editorTheme = EditorView.theme({
  "&": { backgroundColor: "transparent", color: "inherit" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "inherit", maxHeight: "12rem" },
  ".cm-content": { padding: "0", minHeight: "5rem" },
  ".cm-line": { padding: "0" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "currentColor" },
  ".cm-placeholder": { color: "hsl(var(--muted-foreground))" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "hsl(var(--primary) / 0.18)",
  },
});

export const CommentEditor = forwardRef<
  CommentEditorHandle,
  CommentEditorProps
>(function CommentEditor(
  {
    id,
    "aria-invalid": ariaInvalid,
    "aria-describedby": ariaDescribedBy,
    value,
    onChange,
    onCursorChange,
    onKeyDown,
    disabled,
    autoFocus,
  },
  ref,
) {
  const editorRef = useRef<ReactCodeMirrorRef>(null);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => editorRef.current?.view?.focus(),
      getCursorPosition: () =>
        editorRef.current?.view?.state.selection.main.head ?? 0,
      getCursorRect: () => {
        const view = editorRef.current?.view;
        const rect = view?.coordsAtPos(view.state.selection.main.head);
        return rect
          ? new DOMRect(
              rect.left,
              rect.top,
              rect.right - rect.left,
              rect.bottom - rect.top,
            )
          : new DOMRect();
      },
      replaceRange: (from, to, text) => {
        const view = editorRef.current?.view;
        if (!view || disabled) return;
        view.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor: from + text.length },
          scrollIntoView: true,
          userEvent: "input.complete",
        });
        view.focus();
      },
    }),
    [disabled],
  );

  // CodeMirror reconfigures when extensions change identity.
  const extensions = useMemo(
    () => [
      editorTheme,
      commentEditorMentions,
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({
        "aria-label": "New comment",
        "aria-multiline": "true",
        ...(id === undefined ? {} : { id }),
        ...(ariaInvalid === undefined
          ? {}
          : { "aria-invalid": String(ariaInvalid) }),
        ...(ariaDescribedBy === undefined
          ? {}
          : { "aria-describedby": ariaDescribedBy }),
        spellcheck: "true",
      }),
      Prec.highest(
        EditorView.domEventHandlers({
          keydown: (event) => {
            if (disabled || event.isComposing || !onKeyDown?.(event)) {
              return false;
            }
            event.preventDefault();
            return true;
          },
        }),
      ),
    ],
    [ariaDescribedBy, ariaInvalid, disabled, id, onKeyDown],
  );

  return (
    <div
      data-disabled={disabled || undefined}
      className="border-input focus-within:ring-ring ph-no-capture min-w-0 rounded-md border px-3 py-2 text-sm focus-within:ring-1 data-disabled:opacity-50"
    >
      <CodeMirror
        ref={editorRef}
        value={value}
        onChange={onChange}
        onUpdate={(update) => {
          if (update.selectionSet || update.docChanged) {
            onCursorChange?.(update.state.selection.main.head);
          }
        }}
        onCreateEditor={(view) => {
          onCursorChange?.(view.state.selection.main.head);
        }}
        extensions={extensions}
        basicSetup={basicSetup}
        theme="none"
        indentWithTab={false}
        editable={!disabled}
        readOnly={disabled}
        autoFocus={autoFocus}
        placeholder="Add a comment..."
      />
    </div>
  );
});
