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
import { useCallback, useEffect, useMemo, useRef } from "react";
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

const COMPLETION_MARKERS: Record<string, string> = {
  property: "@",
  keyword: "&",
  text: "A",
  snippet: "()",
};

function getCompletionBaseType(type?: string) {
  return type?.split(/\s+/)[0] ?? "text";
}

function getCompletionOptionClass(completion: Completion) {
  const baseType = getCompletionBaseType(completion.type);
  return `events-lucene-completion-option events-lucene-completion-option-${baseType}`;
}

function renderCompletionMarker(completion: Completion) {
  const badge = document.createElement("span");
  const baseType = getCompletionBaseType(completion.type);
  badge.className = `events-lucene-completion-marker events-lucene-completion-marker-${baseType}`;
  badge.textContent = COMPLETION_MARKERS[baseType] ?? "A";
  badge.setAttribute("aria-hidden", "true");
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

type EventsLuceneCompletionTriggerArgs = {
  doc: string;
  cursor: number;
  completionStatus: "active" | "pending" | null;
  startCompletion: () => void;
};

type EventsLuceneTooltipLayoutArgs = {
  container: HTMLElement;
  tooltip: HTMLElement;
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

const EVENTS_LUCENE_VALUE_COMPLETION_TRIGGER_PATTERN =
  /(?:^|[\s(])(?:metadata\.[A-Za-z0-9_.-]*|[A-Za-z_][A-Za-z0-9_.-]*):"?$/;

export function maybeOpenEventsLuceneContextualCompletion({
  doc,
  cursor,
  completionStatus,
  startCompletion,
}: EventsLuceneCompletionTriggerArgs) {
  if (completionStatus === "active" || completionStatus === "pending") {
    return false;
  }

  if (doc.length === 0) {
    startCompletion();
    return true;
  }

  const prefix = doc.slice(0, cursor);

  if (!EVENTS_LUCENE_VALUE_COMPLETION_TRIGGER_PATTERN.test(prefix)) {
    return false;
  }

  startCompletion();
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

export function applyEventsLuceneTooltipLayout({
  container,
  tooltip,
}: EventsLuceneTooltipLayoutArgs) {
  const offsetParent =
    tooltip.offsetParent instanceof HTMLElement
      ? tooltip.offsetParent
      : tooltip.parentElement;

  if (!(offsetParent instanceof HTMLElement)) {
    return false;
  }

  const containerRect = container.getBoundingClientRect();
  const offsetParentRect = offsetParent.getBoundingClientRect();

  if (containerRect.width <= 0) {
    return false;
  }

  const leftOffset = containerRect.left - offsetParentRect.left;
  const width = `${containerRect.width}px`;

  tooltip.style.left = `${leftOffset}px`;
  tooltip.style.right = "auto";
  tooltip.style.width = width;
  tooltip.style.minWidth = width;
  tooltip.style.maxWidth = width;
  tooltip.style.boxSizing = "border-box";

  return true;
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const latestValueRef = useRef(value);
  const tooltipAnimationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    latestValueRef.current = value;
  }, [value]);

  const alignEventsLuceneTooltip = useCallback(() => {
    const container = containerRef.current;

    if (!container) {
      return false;
    }

    const tooltip = container.querySelector<HTMLElement>(
      ".cm-tooltip.cm-tooltip-autocomplete.events-lucene-tooltip",
    );

    if (!tooltip) {
      return false;
    }

    return applyEventsLuceneTooltipLayout({
      container,
      tooltip,
    });
  }, []);

  const scheduleEventsLuceneTooltipAlignment = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (tooltipAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(tooltipAnimationFrameRef.current);
    }

    tooltipAnimationFrameRef.current = window.requestAnimationFrame(() => {
      tooltipAnimationFrameRef.current = null;
      alignEventsLuceneTooltip();
    });
  }, [alignEventsLuceneTooltip]);

  useEffect(() => {
    scheduleEventsLuceneTooltipAlignment();
  }, [value, scheduleEventsLuceneTooltipAlignment]);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            scheduleEventsLuceneTooltipAlignment();
          });
    resizeObserver?.observe(container);

    const mutationObserver =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(() => {
            scheduleEventsLuceneTooltipAlignment();
          });
    mutationObserver?.observe(container, {
      childList: true,
      subtree: true,
    });

    return () => {
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();

      if (
        typeof window !== "undefined" &&
        tooltipAnimationFrameRef.current !== null
      ) {
        window.cancelAnimationFrame(tooltipAnimationFrameRef.current);
        tooltipAnimationFrameRef.current = null;
      }
    };
  }, [scheduleEventsLuceneTooltipAlignment]);

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
            position: 10,
            render: (completion) => renderCompletionMarker(completion),
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
          maybeOpenEventsLuceneContextualCompletion({
            doc: view.state.doc.toString(),
            cursor: view.state.selection.main.head,
            completionStatus: completionStatus(view.state),
            startCompletion: () => startCompletion(view),
          });
          scheduleEventsLuceneTooltipAlignment();
          return false;
        },
        click: (_event, view) => {
          maybeOpenEventsLuceneContextualCompletion({
            doc: view.state.doc.toString(),
            cursor: view.state.selection.main.head,
            completionStatus: completionStatus(view.state),
            startCompletion: () => startCompletion(view),
          });
          scheduleEventsLuceneTooltipAlignment();
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
      EditorView.updateListener.of((update) => {
        if (completionStatus(update.state) === "active") {
          scheduleEventsLuceneTooltipAlignment();
        }

        if (!update.docChanged || !update.view.hasFocus) {
          return;
        }

        maybeOpenEventsLuceneContextualCompletion({
          doc: update.state.doc.toString(),
          cursor: update.state.selection.main.head,
          completionStatus: completionStatus(update.state),
          startCompletion: () => startCompletion(update.view),
        });
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
          border: "1px solid hsl(var(--border) / 0.95)",
          backgroundColor: "hsl(var(--popover))",
          color: "hsl(var(--popover-foreground))",
          borderRadius: "16px",
          boxShadow:
            "0 22px 56px -28px rgba(15, 23, 42, 0.52), 0 12px 28px -22px rgba(15, 23, 42, 0.32)",
          padding: 0,
          overflow: "hidden",
          minWidth: "min(24rem, calc(100vw - 1.5rem))",
          maxWidth: "min(34rem, calc(100vw - 1.5rem))",
          backdropFilter: "blur(10px)",
        },
        ".cm-tooltip.cm-tooltip-autocomplete.events-lucene-tooltip > ul": {
          fontFamily:
            "ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace",
          fontSize: "13px",
          padding: 0,
          maxHeight: "26rem",
          overscrollBehavior: "contain",
        },
        ".cm-tooltip.cm-tooltip-autocomplete.events-lucene-tooltip > ul > li": {
          display: "grid",
          gridTemplateColumns: "1.75rem minmax(0, 1fr) auto",
          alignItems: "center",
          gap: "0.75rem",
          margin: 0,
          padding: "0.85rem 1rem",
          borderRadius: 0,
          color: "hsl(var(--foreground))",
          borderTop: "1px solid hsl(var(--border) / 0.65)",
          lineHeight: "1.25",
          transition:
            "background-color 120ms ease, color 120ms ease, box-shadow 120ms ease",
        },
        ".cm-tooltip.cm-tooltip-autocomplete.events-lucene-tooltip > ul > li:first-of-type":
          {
            borderTop: "none",
          },
        ".cm-tooltip.cm-tooltip-autocomplete.events-lucene-tooltip > ul > li[aria-selected]":
          {
            backgroundColor: "hsl(var(--accent) / 0.72)",
            color: "hsl(var(--accent-foreground))",
            boxShadow: "inset 3px 0 0 hsl(var(--primary))",
          },
        ".cm-tooltip.cm-tooltip-autocomplete.events-lucene-tooltip .cm-completionLabel":
          {
            flex: "1 1 auto",
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontWeight: "500",
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
            justifySelf: "end",
            maxWidth: "16rem",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontSize: "11px",
            textAlign: "right",
            color: "hsl(var(--muted-foreground))",
          },
        ".cm-tooltip.cm-tooltip-autocomplete.events-lucene-tooltip > ul > li[aria-selected] .cm-completionDetail":
          {
            color: "hsl(var(--accent-foreground) / 0.78)",
          },
        ".cm-tooltip.cm-tooltip-autocomplete.events-lucene-tooltip ul [role='presentation']":
          {
            margin: 0,
            padding: "0.8rem 1rem 0.45rem",
            listStyle: "none",
            borderTop: "1px solid hsl(var(--border) / 0.7)",
            backgroundColor: "hsl(var(--muted) / 0.35)",
          },
        ".cm-tooltip.cm-tooltip-autocomplete.events-lucene-tooltip ul [role='presentation']:first-child":
          {
            borderTop: "none",
            paddingTop: "0.7rem",
          },
        ".events-lucene-section": {
          display: "list-item",
        },
        ".events-lucene-section-label": {
          display: "block",
          fontSize: "10px",
          fontWeight: "700",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "hsl(var(--muted-foreground))",
        },
        ".events-lucene-section-detail": {
          display: "block",
          marginTop: "0.2rem",
          fontSize: "11px",
          color: "hsl(var(--muted-foreground))",
        },
        ".events-lucene-completion-marker": {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "999px",
          width: "1.75rem",
          height: "1.75rem",
          fontSize: "10px",
          fontWeight: "700",
          letterSpacing: "0.04em",
          whiteSpace: "nowrap",
          border: "1px solid hsl(var(--border))",
          backgroundColor: "hsl(var(--muted) / 0.6)",
          color: "hsl(var(--muted-foreground))",
          flex: "0 0 auto",
        },
        ".events-lucene-completion-option-property .events-lucene-completion-marker":
          {
            color: "hsl(var(--primary))",
            backgroundColor: "hsl(var(--primary) / 0.08)",
            borderColor: "hsl(var(--primary) / 0.16)",
          },
        ".events-lucene-completion-option-keyword .events-lucene-completion-marker":
          {
            color: "hsl(var(--foreground))",
            backgroundColor: "hsl(var(--secondary))",
            borderColor: "hsl(var(--border) / 0.9)",
          },
        ".events-lucene-completion-option-text .events-lucene-completion-marker":
          {
            color: "hsl(var(--muted-foreground))",
            backgroundColor: "hsl(var(--muted))",
            borderColor: "hsl(var(--border) / 0.85)",
          },
        ".events-lucene-completion-option-snippet .events-lucene-completion-marker":
          {
            color: "hsl(var(--foreground))",
            backgroundColor: "hsl(var(--muted))",
            borderColor: "hsl(var(--border) / 0.85)",
          },
        ".cm-tooltip.cm-tooltip-autocomplete.events-lucene-tooltip > ul > li[aria-selected] .events-lucene-completion-marker":
          {
            backgroundColor: "hsl(var(--background) / 0.9)",
            borderColor: "hsl(var(--border) / 0.85)",
            color: "hsl(var(--foreground))",
          },
      }),
    ],
    [completionSource, onSubmit, scheduleEventsLuceneTooltipAlignment],
  );

  return (
    <div
      ref={containerRef}
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
