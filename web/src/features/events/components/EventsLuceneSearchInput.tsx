import { Button } from "@/src/components/ui/button";
import DocPopup from "@/src/components/layouts/doc-popup";
import { cn } from "@/src/utils/tailwind";
import { darkTheme } from "@/src/components/editor/dark-theme";
import { lightTheme } from "@/src/components/editor/light-theme";
import {
  acceptCompletion,
  autocompletion,
  closeCompletion,
  completionStatus,
  startCompletion,
  type Completion,
  type CompletionContext,
} from "@codemirror/autocomplete";
import { StreamLanguage } from "@codemirror/language";
import type { StringStream } from "@codemirror/language";
import { Prec } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { Search } from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  matchEventsLuceneToken,
  resolveEventsLuceneCompletionItems,
  type EventsLuceneAutocompleteOptions,
} from "./events-lucene-search-utils";

const COMPLETION_MARKERS: Record<string, string> = {
  property: "@",
  keyword: "&",
  text: "A",
  snippet: "()",
};

const EVENTS_LUCENE_DOCS_URL = "https://langfuse.com/docs";

function getCompletionBaseType(type?: string) {
  return type?.split(/\s+/)[0] ?? "text";
}

function getCompletionOptionClass(completion: Completion) {
  const baseType = getCompletionBaseType(completion.type);
  return `events-lucene-completion-option events-lucene-completion-option-${baseType}`;
}

function hasOpenEventsLuceneCompletion(
  status: "active" | "pending" | null,
): boolean {
  return status === "active" || status === "pending";
}

function renderCompletionMarker(completion: Completion) {
  const badge = document.createElement("span");
  const baseType = getCompletionBaseType(completion.type);
  badge.className = `events-lucene-completion-marker events-lucene-completion-marker-${baseType}`;
  badge.textContent = COMPLETION_MARKERS[baseType] ?? "A";
  badge.setAttribute("aria-hidden", "true");
  return badge;
}

export function ensureEventsLuceneTooltipFooter(tooltip: HTMLElement) {
  const existingFooter = tooltip.querySelector<HTMLElement>(
    ".events-lucene-tooltip-footer",
  );

  if (existingFooter) {
    return existingFooter;
  }

  const footer = document.createElement("div");
  footer.className = "events-lucene-tooltip-footer";

  const link = document.createElement("a");
  link.className = "events-lucene-tooltip-footer-link";
  link.href = EVENTS_LUCENE_DOCS_URL;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = "Docs ↗";

  footer.append(link);
  tooltip.append(footer);

  return footer;
}

type EventsLuceneSubmitKeydownArgs = {
  event: {
    key: string;
    ctrlKey?: boolean;
    metaKey?: boolean;
    altKey?: boolean;
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

export function normalizeEventsLuceneEditorValue(value: string) {
  return value.replace(/\s*\n+\s*/g, " ");
}

function submitEventsLuceneQuery({
  completionIsActive,
  acceptCompletion,
  getCurrentValue,
  onSubmit,
}: EventsLuceneSubmitArgs) {
  const submitCurrentValue = () => {
    onSubmit(getCurrentValue());
  };

  if (completionIsActive) {
    acceptCompletion();
    setTimeout(submitCurrentValue, 0);
    return true;
  }

  submitCurrentValue();
  return true;
}

export function maybeOpenEventsLuceneContextualCompletion({
  doc: _doc,
  cursor: _cursor,
  completionStatus,
  startCompletion,
}: EventsLuceneCompletionTriggerArgs) {
  if (completionStatus === "active" || completionStatus === "pending") {
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

type EventsLuceneAutocompleteKeydownArgs = {
  event: {
    key: string;
    ctrlKey?: boolean;
    metaKey?: boolean;
    altKey?: boolean;
    preventDefault: () => void;
    stopPropagation?: () => void;
  };
  completionIsActive: boolean;
  acceptCompletion: () => boolean;
  closeCompletion: () => boolean;
  openCompletion: () => boolean;
};

type EventsLuceneTabKeyBindingArgs = {
  completionIsActive: boolean;
  acceptCompletion: () => boolean;
};

export function handleEventsLuceneTabKeyBinding({
  completionIsActive,
  acceptCompletion,
}: EventsLuceneTabKeyBindingArgs) {
  if (!completionIsActive) {
    return false;
  }

  acceptCompletion();
  return true;
}

export function handleEventsLuceneAutocompleteKeydown({
  event,
  completionIsActive,
  acceptCompletion,
  closeCompletion,
  openCompletion,
}: EventsLuceneAutocompleteKeydownArgs) {
  if (event.key === "Tab" && completionIsActive) {
    event.preventDefault();
    event.stopPropagation?.();
    return acceptCompletion();
  }

  if (event.key === "Escape" && completionIsActive) {
    event.preventDefault();
    event.stopPropagation?.();
    return closeCompletion();
  }

  const isForceOpenShortcut =
    (event.ctrlKey || event.metaKey) &&
    (event.key === " " || event.key === "Spacebar");
  const isArrowOpenShortcut =
    !completionIsActive &&
    (event.key === "ArrowDown" || event.key === "ArrowUp");

  if (!isForceOpenShortcut && !isArrowOpenShortcut) {
    return false;
  }

  const didOpen = openCompletion();

  if (!didOpen) {
    return false;
  }

  event.preventDefault();
  event.stopPropagation?.();
  return true;
}

export function applyEventsLuceneTooltipLayout({
  container,
  tooltip,
}: EventsLuceneTooltipLayoutArgs) {
  const tooltipStyle = window.getComputedStyle(tooltip);
  const isFixedTooltip = tooltipStyle.position === "fixed";
  const offsetParent =
    tooltip.offsetParent instanceof HTMLElement
      ? tooltip.offsetParent
      : tooltip.parentElement;

  if (!isFixedTooltip && !(offsetParent instanceof HTMLElement)) {
    return false;
  }

  const containerRect = container.getBoundingClientRect();
  const offsetParentRect =
    offsetParent instanceof HTMLElement
      ? offsetParent.getBoundingClientRect()
      : null;

  if (containerRect.width <= 0) {
    return false;
  }

  const leftOffset = isFixedTooltip
    ? containerRect.left
    : containerRect.left - (offsetParentRect?.left ?? 0);
  const width = `${containerRect.width}px`;
  const left = `${leftOffset}px`;

  container.style.setProperty("--events-lucene-tooltip-left", left);
  container.style.setProperty("--events-lucene-tooltip-width", width);

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
  const editorViewRef = useRef<EditorView | null>(null);
  const latestOnSubmitRef = useRef(onSubmit);
  const tooltipAnimationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    latestOnSubmitRef.current = onSubmit;
  }, [onSubmit]);

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

    ensureEventsLuceneTooltipFooter(tooltip);

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

    return () => {
      resizeObserver?.disconnect();

      if (
        typeof window !== "undefined" &&
        tooltipAnimationFrameRef.current !== null
      ) {
        window.cancelAnimationFrame(tooltipAnimationFrameRef.current);
        tooltipAnimationFrameRef.current = null;
      }

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
        }));

      return {
        from: result.from,
        to: result.to,
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
      Prec.highest(
        keymap.of([
          {
            key: "Tab",
            run: (view) => {
              const currentCompletionStatus = completionStatus(view.state);

              return handleEventsLuceneTabKeyBinding({
                completionIsActive: hasOpenEventsLuceneCompletion(
                  currentCompletionStatus,
                ),
                acceptCompletion: () => acceptCompletion(view),
              });
            },
          },
          {
            key: "Enter",
            run: (view) => {
              const currentCompletionStatus = completionStatus(view.state);

              return submitEventsLuceneQuery({
                completionIsActive: hasOpenEventsLuceneCompletion(
                  currentCompletionStatus,
                ),
                acceptCompletion: () => acceptCompletion(view),
                getCurrentValue: () =>
                  normalizeEventsLuceneEditorValue(view.state.doc.toString()),
                onSubmit: (valueOverride) =>
                  latestOnSubmitRef.current(valueOverride),
              });
            },
          },
          {
            key: "Shift-Enter",
            run: (view) => {
              const currentCompletionStatus = completionStatus(view.state);

              return submitEventsLuceneQuery({
                completionIsActive: hasOpenEventsLuceneCompletion(
                  currentCompletionStatus,
                ),
                acceptCompletion: () => acceptCompletion(view),
                getCurrentValue: () =>
                  normalizeEventsLuceneEditorValue(view.state.doc.toString()),
                onSubmit: (valueOverride) =>
                  latestOnSubmitRef.current(valueOverride),
              });
            },
          },
        ]),
      ),
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
          const currentCompletionStatus = completionStatus(view.state);
          const autocompleteHandled = handleEventsLuceneAutocompleteKeydown({
            event,
            completionIsActive: hasOpenEventsLuceneCompletion(
              currentCompletionStatus,
            ),
            acceptCompletion: () => acceptCompletion(view),
            closeCompletion: () => closeCompletion(view),
            openCompletion: () =>
              maybeOpenEventsLuceneContextualCompletion({
                doc: view.state.doc.toString(),
                cursor: view.state.selection.main.head,
                completionStatus: completionStatus(view.state),
                startCompletion: () => startCompletion(view),
              }),
          });

          if (autocompleteHandled) {
            return true;
          }

          return handleEventsLuceneSubmitKeydown({
            event,
            completionIsActive: hasOpenEventsLuceneCompletion(
              currentCompletionStatus,
            ),
            acceptCompletion: () => acceptCompletion(view),
            getCurrentValue: () =>
              normalizeEventsLuceneEditorValue(view.state.doc.toString()),
            onSubmit: (valueOverride) =>
              latestOnSubmitRef.current(valueOverride),
          });
        },
      }),
      EditorView.inputHandler.of((view, from, to, text) => {
        const normalizedText = normalizeEventsLuceneEditorValue(text);

        if (normalizedText === text) {
          return false;
        }

        view.dispatch({
          changes: { from, to, insert: normalizedText },
        });
        return true;
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
          overflowX: "auto",
          overflowY: "hidden",
          fontFamily:
            "ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        },
        ".cm-scroller::-webkit-scrollbar": {
          display: "none",
        },
        ".cm-editor": {
          minHeight: "3.25rem",
          height: "3.25rem",
        },
        ".cm-content": {
          padding: "0.7rem 0",
          whiteSpace: "pre",
          overflowWrap: "normal",
          wordBreak: "normal",
        },
        ".cm-line": {
          padding: 0,
          lineHeight: "1.5",
          whiteSpace: "nowrap",
        },
        ".cm-keyword": {
          color: "hsl(var(--primary))",
          fontWeight: "700",
          letterSpacing: "0.01em",
        },
        ".cm-bracket": {
          color: "hsl(var(--foreground))",
          fontWeight: "700",
        },
        ".cm-punctuation": {
          color: "hsl(var(--foreground) / 0.92)",
          fontWeight: "700",
        },
        ".cm-placeholder": {
          color: "hsl(var(--muted-foreground))",
        },
        ".cm-tooltip.cm-tooltip-autocomplete.events-lucene-tooltip": {
          left: "var(--events-lucene-tooltip-left, 0px) !important",
          right: "auto !important",
          width: "var(--events-lucene-tooltip-width, auto) !important",
          minWidth: "var(--events-lucene-tooltip-width, auto) !important",
          maxWidth: "var(--events-lucene-tooltip-width, auto) !important",
          boxSizing: "border-box",
          border: "1px solid hsl(var(--border) / 0.95)",
          backgroundColor: "hsl(var(--popover))",
          color: "hsl(var(--popover-foreground))",
          borderRadius: "10px",
          boxShadow:
            "0 18px 40px -30px rgba(15, 23, 42, 0.5), 0 10px 24px -20px rgba(15, 23, 42, 0.28)",
          padding: "0.25rem",
          overflow: "hidden",
          backdropFilter: "blur(10px)",
          transform: "translateY(24px)",
          display: "flex",
          flexDirection: "column",
        },
        ".cm-tooltip.cm-tooltip-autocomplete.events-lucene-tooltip > ul": {
          display: "block",
          width: "100%",
          minWidth: "100%",
          boxSizing: "border-box",
          fontFamily:
            "ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace",
          fontSize: "13px",
          padding: "0.25rem",
          maxHeight: "calc(24rem - 2.9rem)",
          overscrollBehavior: "contain",
          flex: "1 1 auto",
        },
        ".cm-tooltip.cm-tooltip-autocomplete.events-lucene-tooltip > ul > li": {
          display: "grid",
          width: "100%",
          boxSizing: "border-box",
          gridTemplateColumns: "1rem minmax(0, 1fr) auto",
          alignItems: "center",
          gap: "0.5rem",
          margin: 0,
          padding: "0.375rem 0.5rem",
          borderRadius: "2px",
          color: "hsl(var(--foreground))",
          borderTop: "none",
          lineHeight: "1.25",
          transition: "background-color 120ms ease, color 120ms ease",
          cursor: "default",
          userSelect: "none",
        },
        ".cm-tooltip.cm-tooltip-autocomplete.events-lucene-tooltip > ul > li[aria-selected]":
          {
            backgroundColor: "hsl(var(--accent))",
            color: "hsl(var(--accent-foreground))",
          },
        ".cm-tooltip.cm-tooltip-autocomplete.events-lucene-tooltip .cm-completionLabel":
          {
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontWeight: "400",
            letterSpacing: "0",
            fontSize: "0.875rem",
          },
        ".cm-tooltip.cm-tooltip-autocomplete.events-lucene-tooltip .cm-completionMatchedText":
          {
            color: "hsl(var(--primary))",
            textDecoration: "none",
            fontWeight: "600",
          },
        ".cm-tooltip.cm-tooltip-autocomplete.events-lucene-tooltip > ul > li[aria-selected] .cm-completionMatchedText":
          {
            color: "inherit",
          },
        ".cm-tooltip.cm-tooltip-autocomplete.events-lucene-tooltip .cm-completionDetail":
          {
            maxWidth: "20rem",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontSize: "0.75rem",
            fontWeight: "400",
            textAlign: "right",
            color: "hsl(var(--muted-foreground))",
            marginLeft: "auto",
          },
        ".cm-tooltip.cm-tooltip-autocomplete.events-lucene-tooltip > ul > li[aria-selected] .cm-completionDetail":
          {
            color: "hsl(var(--accent-foreground) / 0.8)",
          },
        ".events-lucene-completion-marker": {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "1rem",
          height: "1rem",
          fontSize: "0.75rem",
          fontWeight: "500",
          letterSpacing: "0",
          whiteSpace: "nowrap",
          color: "hsl(var(--muted-foreground))",
          flex: "0 0 auto",
        },
        ".events-lucene-completion-option-property .events-lucene-completion-marker":
          {
            color: "hsl(var(--primary))",
          },
        ".events-lucene-completion-option-keyword .events-lucene-completion-marker":
          {
            color: "hsl(var(--foreground))",
          },
        ".events-lucene-completion-option-text .events-lucene-completion-marker":
          {
            color: "hsl(var(--muted-foreground))",
          },
        ".events-lucene-completion-option-snippet .events-lucene-completion-marker":
          {
            color: "hsl(var(--foreground))",
          },
        ".cm-tooltip.cm-tooltip-autocomplete.events-lucene-tooltip > ul > li[aria-selected] .events-lucene-completion-marker":
          {
            color: "hsl(var(--accent-foreground))",
          },
        ".events-lucene-tooltip-footer": {
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          borderTop: "1px solid hsl(var(--border) / 0.8)",
          padding: "0.5rem 0.75rem 0.625rem",
          flex: "0 0 auto",
        },
        ".events-lucene-tooltip-footer-link": {
          fontSize: "0.75rem",
          lineHeight: "1rem",
          color: "hsl(var(--muted-foreground))",
          textDecoration: "none",
          transition: "color 120ms ease",
        },
        ".events-lucene-tooltip-footer-link:hover": {
          color: "hsl(var(--foreground))",
        },
      }),
    ],
    [completionSource, scheduleEventsLuceneTooltipAlignment],
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
        onClick={() =>
          onSubmit(
            normalizeEventsLuceneEditorValue(
              editorViewRef.current?.state.doc.toString() ?? value,
            ),
          )
        }
      >
        <Search className="h-4 w-4" />
      </Button>
      <CodeMirror
        value={value}
        onCreateEditor={(view) => {
          editorViewRef.current = view;
        }}
        theme={codeMirrorTheme}
        basicSetup={{
          lineNumbers: false,
          foldGutter: false,
          highlightActiveLine: false,
        }}
        extensions={extensions}
        onChange={(nextValue) => {
          const normalizedValue = normalizeEventsLuceneEditorValue(nextValue);
          onChange(normalizedValue);
        }}
        placeholder={placeholder}
        className="min-w-0 flex-1 text-sm"
      />
      <div className="mt-2 mr-2 hidden shrink-0 items-center self-start sm:flex">
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
