import { Button } from "@/src/components/ui/button";
import { Badge } from "@/src/components/ui/badge";
import DocPopup from "@/src/components/layouts/doc-popup";
import { cn } from "@/src/utils/tailwind";
import { darkTheme } from "@/src/components/editor/dark-theme";
import { lightTheme } from "@/src/components/editor/light-theme";
import {
  acceptCompletion,
  autocompletion,
  completionStatus,
  startCompletion,
  type Completion,
  type CompletionSection,
  type CompletionContext,
} from "@codemirror/autocomplete";
import { StreamLanguage } from "@codemirror/language";
import type { StringStream } from "@codemirror/language";
import { keymap } from "@codemirror/view";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { Search } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useRef } from "react";
import {
  matchEventsLuceneToken,
  resolveEventsLuceneCompletionItems,
  type EventsLuceneAutocompleteOptions,
  type EventsLuceneCompletionSection,
} from "./events-lucene-search-utils";

function createCompletionSection(
  name: EventsLuceneCompletionSection,
  description: string,
  rank: number,
): CompletionSection {
  return {
    name,
    rank,
    header: () => {
      const container = document.createElement("div");
      container.className = "events-lucene-section";
      container.style.display = "list-item";

      const label = document.createElement("span");
      label.className = "events-lucene-section-label";
      label.textContent = name;

      const detail = document.createElement("span");
      detail.className = "events-lucene-section-detail";
      detail.textContent = description;

      container.append(label, detail);
      return container;
    },
  };
}

const COMPLETION_SECTIONS: Record<
  EventsLuceneCompletionSection,
  CompletionSection
> = {
  Fields: createCompletionSection("Fields", "Filterable event attributes", 1),
  Operators: createCompletionSection("Operators", "Boolean query logic", 2),
  "Observed Values": createCompletionSection(
    "Observed Values",
    "Popular values from this dataset",
    3,
  ),
  Patterns: createCompletionSection("Patterns", "Helpful Lucene snippets", 4),
};

const COMPLETION_BADGE_LABELS: Record<string, string> = {
  property: "Field",
  keyword: "Logic",
  text: "Value",
  snippet: "Pattern",
};

function getCompletionBaseType(type?: string) {
  return type?.split(/\s+/)[0] ?? "text";
}

function getCompletionOptionClass(completion: Completion) {
  const baseType = getCompletionBaseType(completion.type);
  return `events-lucene-completion-option events-lucene-completion-option-${baseType}`;
}

function renderCompletionBadge(completion: Completion) {
  const badge = document.createElement("span");
  const baseType = getCompletionBaseType(completion.type);
  badge.className = `events-lucene-completion-badge events-lucene-completion-badge-${baseType}`;
  badge.textContent = COMPLETION_BADGE_LABELS[baseType] ?? "Value";
  return badge;
}

type EventsLuceneSubmitKeydownArgs = {
  event: {
    key: string;
    preventDefault: () => void;
    stopPropagation?: () => void;
  };
  completionIsActive: boolean;
  acceptCompletion: () => boolean;
  getCurrentValue: () => string;
  onSubmit: (value: string) => void;
};

type EventsLuceneSubmitArgs = {
  completionIsActive: boolean;
  acceptCompletion: () => boolean;
  getCurrentValue: () => string;
  onSubmit: (value: string) => void;
};

function submitEventsLuceneQuery({
  completionIsActive,
  acceptCompletion,
  getCurrentValue,
  onSubmit,
}: EventsLuceneSubmitArgs) {
  if (completionIsActive) {
    acceptCompletion();
  }

  onSubmit(getCurrentValue());
  return true;
}

export function handleEventsLuceneSubmitKeydown({
  event,
  completionIsActive,
  acceptCompletion,
  getCurrentValue,
  onSubmit,
}: EventsLuceneSubmitKeydownArgs) {
  if (event.key !== "Enter") {
    return false;
  }

  event.preventDefault();
  event.stopPropagation?.();
  return submitEventsLuceneQuery({
    completionIsActive,
    acceptCompletion,
    getCurrentValue,
    onSubmit,
  });
}

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
          section: item.section ? COMPLETION_SECTIONS[item.section] : undefined,
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
        tooltipClass: () => "events-lucene-tooltip",
        optionClass: getCompletionOptionClass,
        addToOptions: [
          {
            position: 65,
            render: (completion) => renderCompletionBadge(completion),
          },
        ],
      }),
      keymap.of([
        {
          key: "Enter",
          run: (view) =>
            submitEventsLuceneQuery({
              completionIsActive: completionStatus(view.state) === "active",
              acceptCompletion: () => acceptCompletion(view),
              getCurrentValue: () => view.state.doc.toString(),
              onSubmit,
            }),
        },
        {
          key: "Shift-Enter",
          run: (view) =>
            submitEventsLuceneQuery({
              completionIsActive: completionStatus(view.state) === "active",
              acceptCompletion: () => acceptCompletion(view),
              getCurrentValue: () => view.state.doc.toString(),
              onSubmit,
            }),
        },
      ]),
      EditorView.lineWrapping,
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
          return handleEventsLuceneSubmitKeydown({
            event,
            completionIsActive: completionStatus(view.state) === "active",
            acceptCompletion: () => acceptCompletion(view),
            getCurrentValue: () => view.state.doc.toString(),
            onSubmit,
          });
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
          overflowX: "hidden",
          overflowY: "hidden",
          fontFamily:
            "ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace",
        },
        ".cm-editor": {
          minHeight: "3.25rem",
          height: "auto",
        },
        ".cm-content": {
          padding: "0.7rem 0",
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
          wordBreak: "break-word",
        },
        ".cm-line": {
          padding: 0,
          lineHeight: "1.5",
        },
        ".cm-placeholder": {
          color: "hsl(var(--muted-foreground))",
        },
        ".cm-tooltip.cm-tooltip-autocomplete.events-lucene-tooltip": {
          border: "1px solid hsl(var(--border))",
          backgroundColor: "hsl(var(--popover))",
          color: "hsl(var(--popover-foreground))",
          borderRadius: "18px",
          boxShadow: "0 28px 80px -32px rgba(15, 23, 42, 0.45)",
          padding: "6px",
          overflow: "hidden",
          minWidth: "min(24rem, calc(100vw - 1.5rem))",
          maxWidth: "min(34rem, calc(100vw - 1.5rem))",
          backdropFilter: "blur(14px)",
        },
        ".cm-tooltip.cm-tooltip-autocomplete.events-lucene-tooltip > ul": {
          fontFamily:
            "ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace",
          fontSize: "13px",
          padding: "2px",
          maxHeight: "22rem",
          overscrollBehavior: "contain",
        },
        ".cm-tooltip.cm-tooltip-autocomplete.events-lucene-tooltip > ul > li": {
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          margin: "2px 0",
          padding: "0.7rem 0.8rem",
          borderRadius: "12px",
          color: "hsl(var(--foreground))",
          border: "1px solid transparent",
          lineHeight: "1.25",
          transition:
            "background-color 120ms ease, border-color 120ms ease, color 120ms ease",
        },
        ".cm-tooltip.cm-tooltip-autocomplete.events-lucene-tooltip > ul > li[aria-selected]":
          {
            backgroundColor: "hsl(var(--accent))",
            color: "hsl(var(--accent-foreground))",
            borderColor: "hsl(var(--border))",
          },
        ".cm-tooltip.cm-tooltip-autocomplete.events-lucene-tooltip .cm-completionLabel":
          {
            flex: "1 1 auto",
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontWeight: "600",
            letterSpacing: "-0.01em",
          },
        ".cm-tooltip.cm-tooltip-autocomplete.events-lucene-tooltip .cm-completionMatchedText":
          {
            color: "hsl(var(--primary))",
            textDecoration: "none",
            fontWeight: "700",
          },
        ".cm-tooltip.cm-tooltip-autocomplete.events-lucene-tooltip > ul > li[aria-selected] .cm-completionMatchedText":
          {
            color: "inherit",
          },
        ".cm-tooltip.cm-tooltip-autocomplete.events-lucene-tooltip .cm-completionDetail":
          {
            flex: "0 0 auto",
            fontSize: "11px",
            color: "hsl(var(--muted-foreground))",
          },
        ".cm-tooltip.cm-tooltip-autocomplete.events-lucene-tooltip > ul > li[aria-selected] .cm-completionDetail":
          {
            color: "hsl(var(--accent-foreground) / 0.78)",
          },
        ".cm-tooltip.cm-tooltip-autocomplete.events-lucene-tooltip ul [role='presentation']":
          {
            margin: "0.45rem 0.35rem 0.15rem",
            padding: 0,
            listStyle: "none",
          },
        ".cm-tooltip.cm-tooltip-autocomplete.events-lucene-tooltip ul [role='presentation']:first-child":
          {
            marginTop: "0.1rem",
          },
        ".events-lucene-section": {
          display: "list-item",
        },
        ".events-lucene-section-label": {
          display: "block",
          fontSize: "10px",
          fontWeight: "700",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "hsl(var(--muted-foreground))",
        },
        ".events-lucene-section-detail": {
          display: "block",
          marginTop: "0.18rem",
          fontSize: "11px",
          color: "hsl(var(--muted-foreground))",
        },
        ".events-lucene-completion-badge": {
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "999px",
          padding: "0.18rem 0.5rem",
          fontSize: "10px",
          fontWeight: "700",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
          border: "1px solid transparent",
          flex: "0 0 auto",
        },
        ".events-lucene-completion-option-property .events-lucene-completion-badge":
          {
            color: "hsl(var(--primary))",
            backgroundColor: "hsl(var(--primary) / 0.08)",
            borderColor: "hsl(var(--primary) / 0.12)",
          },
        ".events-lucene-completion-option-keyword .events-lucene-completion-badge":
          {
            color: "hsl(var(--secondary-foreground))",
            backgroundColor: "hsl(var(--secondary))",
            borderColor: "hsl(var(--border))",
          },
        ".events-lucene-completion-option-text .events-lucene-completion-badge":
          {
            color: "hsl(var(--muted-foreground))",
            backgroundColor: "hsl(var(--muted))",
            borderColor: "hsl(var(--border))",
          },
        ".events-lucene-completion-option-snippet .events-lucene-completion-badge":
          {
            color: "hsl(var(--accent-foreground))",
            backgroundColor: "hsl(var(--accent))",
            borderColor: "hsl(var(--border))",
          },
        ".cm-tooltip.cm-tooltip-autocomplete.events-lucene-tooltip > ul > li[aria-selected] .events-lucene-completion-badge":
          {
            backgroundColor: "hsl(var(--background) / 0.72)",
            borderColor: "hsl(var(--background) / 0.12)",
            color: "hsl(var(--foreground))",
          },
      }),
    ],
    [completionSource, onSubmit],
  );

  return (
    <div
      className={cn(
        "border-input bg-background focus-within:border-primary focus-within:ring-primary/10 flex min-h-12 flex-1 items-start overflow-hidden rounded-md border shadow-xs transition-colors focus-within:ring-2",
        error &&
          "border-destructive focus-within:border-destructive focus-within:ring-destructive/10",
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        className="text-muted-foreground hover:text-foreground mt-2 mr-1 ml-1 h-7 w-7 shrink-0 self-start"
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
      <div className="mt-2 mr-2 hidden shrink-0 items-center gap-2 self-start sm:flex">
        <Badge
          variant="secondary"
          className="h-5 rounded-sm px-1.5 text-[10px]"
        >
          Lucene
        </Badge>
        {helpDescription && <DocPopup description={helpDescription} />}
      </div>
      {helpDescription && (
        <div className="mt-2 mr-2 shrink-0 self-start sm:hidden">
          <DocPopup description={helpDescription} />
        </div>
      )}
    </div>
  );
}
