import { Button } from "@/src/components/ui/button";
import { Badge } from "@/src/components/ui/badge";
import DocPopup from "@/src/components/layouts/doc-popup";
import { cn } from "@/src/utils/tailwind";
import { darkTheme } from "@/src/components/editor/dark-theme";
import { lightTheme } from "@/src/components/editor/light-theme";
import {
  autocompletion,
  completionStatus,
  startCompletion,
  type Completion,
  type CompletionContext,
} from "@codemirror/autocomplete";
import { StreamLanguage } from "@codemirror/language";
import type { StringStream } from "@codemirror/language";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { Search } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useRef } from "react";
import {
  matchEventsLuceneToken,
  resolveEventsLuceneCompletionItems,
  type EventsLuceneAutocompleteOptions,
} from "./events-lucene-search-utils";

const eventsLuceneLanguage = StreamLanguage.define({
  name: "events-lucene",
  startState: () => ({}),
  token: (stream: StringStream) => {
    const match = matchEventsLuceneToken(stream.string.slice(stream.pos));

    if (match.length <= 0) {
      stream.next();
      return null;
    }

    stream.pos += match.length;
    return match.token;
  },
});

type EventsLuceneSearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (valueOverride?: string) => void;
  error?: string | null;
  placeholder: string;
  helpDescription?: React.ReactNode;
  fieldOptions: EventsLuceneAutocompleteOptions;
};

export function EventsLuceneSearchInput({
  value,
  onChange,
  onSubmit,
  error,
  placeholder,
  helpDescription,
  fieldOptions,
}: EventsLuceneSearchInputProps) {
  const { resolvedTheme } = useTheme();
  const codeMirrorTheme = resolvedTheme === "dark" ? darkTheme : lightTheme;
  const latestValueRef = useRef(value);

  useEffect(() => {
    latestValueRef.current = value;
  }, [value]);

  const completionSource = useMemo(
    () => (context: CompletionContext) => {
      const result = resolveEventsLuceneCompletionItems(
        context.state.doc.toString(),
        context.pos,
        fieldOptions,
      );

      if (result.items.length === 0) {
        return null;
      }

      const completions: Completion[] = result.items
        .slice(0, 20)
        .map((item) => ({
          label: item.label,
          apply: item.apply,
          type: item.type,
          detail: item.detail,
          boost: item.boost,
        }));

      return {
        from: result.from,
        options: completions,
      };
    },
    [fieldOptions],
  );

  const extensions = useMemo(
    () => [
      eventsLuceneLanguage,
      autocompletion({
        override: [completionSource],
        activateOnTyping: true,
        maxRenderedOptions: 12,
        icons: false,
      }),
      EditorView.contentAttributes.of({
        "aria-label": "Events Lucene search",
      }),
      EditorView.domEventHandlers({
        focus: (_event, view) => {
          if (view.state.doc.length === 0) {
            startCompletion(view);
          }
          return false;
        },
        keydown: (event, view) => {
          if (
            event.key === "Enter" &&
            !event.shiftKey &&
            completionStatus(view.state) !== "active"
          ) {
            event.preventDefault();
            onSubmit(view.state.doc.toString());
            return true;
          }

          return false;
        },
      }),
      EditorView.theme({
        "&": {
          flex: 1,
          minWidth: 0,
          backgroundColor: "transparent",
        },
        "&.cm-focused": {
          outline: "none",
        },
        ".cm-scroller": {
          overflowX: "auto",
          overflowY: "hidden",
          fontFamily:
            "ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace",
        },
        ".cm-content": {
          padding: "8px 0",
          whiteSpace: "nowrap",
        },
        ".cm-line": {
          padding: 0,
        },
        ".cm-placeholder": {
          color: "hsl(var(--muted-foreground))",
        },
      }),
    ],
    [completionSource, onSubmit],
  );

  return (
    <div
      className={cn(
        "border-input bg-background focus-within:border-primary focus-within:ring-primary/10 flex min-h-8 flex-1 items-center overflow-hidden rounded-md border shadow-xs transition-colors focus-within:ring-2",
        error &&
          "border-destructive focus-within:border-destructive focus-within:ring-destructive/10",
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        className="text-muted-foreground hover:text-foreground mr-1 ml-1 h-7 w-7 shrink-0"
        onClick={() => onSubmit(latestValueRef.current)}
      >
        <Search className="h-4 w-4" />
      </Button>
      <CodeMirror
        value={value}
        theme={codeMirrorTheme}
        basicSetup={{
          lineNumbers: false,
          foldGutter: false,
          highlightActiveLine: false,
        }}
        extensions={extensions}
        onChange={(nextValue) => {
          const normalizedValue = nextValue.replace(/\s*\n+\s*/g, " ");
          latestValueRef.current = normalizedValue;
          onChange(normalizedValue);
        }}
        placeholder={placeholder}
        className="min-w-0 flex-1 text-sm"
      />
      <div className="mr-2 hidden shrink-0 items-center gap-2 sm:flex">
        <Badge
          variant="secondary"
          className="h-5 rounded-sm px-1.5 text-[10px]"
        >
          Lucene
        </Badge>
        {helpDescription && <DocPopup description={helpDescription} />}
      </div>
      {helpDescription && (
        <div className="mr-2 shrink-0 sm:hidden">
          <DocPopup description={helpDescription} />
        </div>
      )}
    </div>
  );
}
