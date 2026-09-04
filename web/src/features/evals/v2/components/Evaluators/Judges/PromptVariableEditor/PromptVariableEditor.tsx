import { Fragment, useMemo, type ReactNode } from "react";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  type ViewUpdate,
} from "@uiw/react-codemirror";
import { Prec } from "@codemirror/state";

import { CodeMirrorEditor } from "@/src/components/editor";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import { cn } from "@/src/utils/tailwind";
import { isValidVariableName, MUSTACHE_REGEX } from "@langfuse/shared";
import { truncateEnd } from "@/src/features/evals/v2/fns/variableMapping/segmentsToJsonPath";

export type InterpolatedPromptPreviewState =
  | {
      status: "ready";
      fragments: Array<
        | { type: "text"; text: string }
        | { type: "variable"; name: string; value: string }
      >;
    }
  | { status: "unavailable"; message: string };

// Match the text inset of the neighboring form controls (px-3 triggers)
// instead of the editor's narrow code gutter padding.
const promptFontTheme = EditorView.theme({
  // Match createTheme's selector specificity so this prompt-only override wins
  // over the shared editor theme's monospace default.
  "&.cm-editor .cm-scroller": { fontFamily: "var(--font-sans)" },
  ".cm-content": { padding: "8px 0", lineHeight: "1.25rem" },
  ".cm-line": { padding: "0 12px" },
});

// A saved prompt is a static surface, so use the muted read-only fill. This has
// to go through CodeMirror's own theming at matching selector specificity:
// createTheme paints the editor background from an injected stylesheet that a
// Tailwind class cannot outrank.
const readOnlySurfaceTheme = EditorView.theme({
  "&.cm-editor, &.cm-editor .cm-gutters": {
    backgroundColor: "hsl(var(--muted) / 0.5)",
  },
});

/** Mapping health of a variable against the selected sample data. */
export type VariableMappingStatus = {
  status: "valid" | "invalid";
  /** Error shown on hover when the variable is not connected to the data. */
  message?: string;
};

// Safety net for pathological labels; the mapping labels themselves are
// already collapsed to "root › … › leaf" upstream (formatMappingLabel).
const MAX_LABEL_LENGTH = 36;

// Linter-style token highlighting for {{variable}}: healthy variables are
// accent-colored prose text, broken/unmapped ones get an amber wavy
// underline (the universal "there's a problem here" editor idiom). The
// binding itself lives in the variable mapping panel — here it only appears in
// the hover title.
function createVariableHighlighter(
  getStatus: (variable: string) => VariableMappingStatus | undefined,
  getMappingLabel: (variable: string) => string | undefined,
  validateVariableMappings: boolean,
) {
  const decorator = new MatchDecorator({
    regexp: new RegExp(MUSTACHE_REGEX.source, MUSTACHE_REGEX.flags),
    decorate: (add, from, to, match) => {
      const hasValidName = isValidVariableName(match[1]);
      const mappingLabel = hasValidName ? getMappingLabel(match[1]) : undefined;
      const status = !hasValidName
        ? {
            status: "invalid" as const,
            message:
              "Variable must start with a letter and can only contain letters and underscores",
          }
        : (getStatus(match[1]) ??
          (mappingLabel
            ? { status: "valid" as const }
            : validateVariableMappings
              ? { status: "invalid" as const }
              : undefined));
      const invalid = status?.status === "invalid";
      const label = truncateEnd(mappingLabel || "map data", MAX_LABEL_LENGTH);
      const title = invalid
        ? (status.message ?? "Not connected to the sample data")
        : mappingLabel
          ? `Pulls from ${label}`
          : undefined;
      add(
        from,
        to,
        Decoration.mark({
          class: `cm-eval-variable${status ? ` cm-eval-variable-${status.status}` : ""}`,
          attributes: title ? { title } : undefined,
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

const invalidVariableTextStyle = {
  color: "hsl(var(--primary-accent)) !important",
  textDecorationLine: "underline",
  textDecorationStyle: "wavy",
  textDecorationColor:
    "color-mix(in srgb, var(--dark-yellow) 80%, transparent)",
  textDecorationThickness: "1px",
  textUnderlineOffset: "3px",
};

const variableTheme = EditorView.baseTheme({
  // Syntax-highlighted token, not a widget: accent text that stays in the
  // prose flow while mappings are managed in the dedicated panel.
  ".cm-eval-variable": {
    fontSize: "var(--text-sm)",
    fontWeight: "var(--font-weight-bold)",
    color: "hsl(var(--primary-accent))",
  },
  // Broken mapping (unmapped, errors, or resolves empty against the sample):
  // keep the variable accent text and add an amber wavy underline, like a
  // linter warning. The error text is in the hover title.
  ".cm-eval-variable.cm-eval-variable-invalid": invalidVariableTextStyle,
  ".cm-eval-variable.cm-eval-variable-invalid *": {
    color: "hsl(var(--primary-accent)) !important",
  },
  ".cm-eval-variable-invalid:hover": {
    backgroundColor: "color-mix(in srgb, var(--dark-yellow) 10%, transparent)",
  },
});

/**
 * Prompt editor with syntax-highlighted {{variable}} tokens: healthy
 * variables render as accent text, with broken ones receiving a linter-style
 * amber wavy underline. Mapping remains an explicit card action rather than
 * a hidden navigation affordance in the prompt text.
 */
export function PromptVariableEditor({
  value,
  onChange,
  variableStatus,
  variableMappings,
  previewEnabled = false,
  onPreviewEnabledChange,
  showPreviewToggle = false,
  previewDisabledReason = null,
  preview,
  readOnly = false,
  validateVariableMappings = true,
  renderPreviewText = (value) => value,
  toolbarStart,
  toolbarActionsBeforePreview,
  toolbarActions,
  onToolbarClick,
  collapsed = false,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Per-variable mapping health against the sample data — drives the pill's
      broken-mapping state. */
  variableStatus?: Record<string, VariableMappingStatus>;
  /** Per-variable display label of the current data binding (e.g. "Input"),
      shown in the variable's hover title. */
  variableMappings?: Record<string, string>;
  /** When true, render the interpolated preview instead of the editor. */
  previewEnabled?: boolean;
  onPreviewEnabledChange?: (enabled: boolean) => void;
  showPreviewToggle?: boolean;
  /** Non-null disables the preview toggle, with this as the tooltip hint. */
  previewDisabledReason?: string | null;
  /** Interpolated prompt state prepared by the owning container. */
  preview?: InterpolatedPromptPreviewState;
  /** Preserve variable syntax highlighting without exposing editor controls. */
  readOnly?: boolean;
  /** Whether variables without a known mapping should receive a warning. */
  validateVariableMappings?: boolean;
  /** Optional media-aware renderer for interpolated preview text. */
  renderPreviewText?: (value: string) => ReactNode;
  /** Controls rendered on the left side of the prompt header. */
  toolbarStart?: ReactNode;
  /** Controls rendered before the preview toggle on the right side. */
  toolbarActionsBeforePreview?: ReactNode;
  /** Controls rendered after the preview toggle on the right side. */
  toolbarActions?: ReactNode;
  /** Makes non-interactive areas of the prompt header toggle the message. */
  onToolbarClick?: () => void;
  /** Hides the editor/preview while preserving the prompt header. */
  collapsed?: boolean;
}) {
  // Statuses and labels travel as serialized keys and are parsed back inside
  // the memo, so the memo depends on their content rather than their identity.
  // The round trip is load-bearing in both directions: callers pass fresh
  // objects every render, and only an extensions identity change makes
  // react-codemirror reconfigure the editor — which is the only thing that
  // re-runs the decorator while the document itself is unchanged.
  const statusKey = JSON.stringify(variableStatus ?? {});
  const mappingsKey = JSON.stringify(variableMappings ?? {});
  const extensions = useMemo(() => {
    const status: Record<string, VariableMappingStatus> = JSON.parse(statusKey);
    const mappingLabels: Record<string, string> = JSON.parse(mappingsKey);
    return [
      createVariableHighlighter(
        (variable) => status[variable],
        (variable) => mappingLabels[variable],
        validateVariableMappings,
      ),
      variableTheme,
      Prec.highest(promptFontTheme),
      ...(readOnly ? [Prec.highest(readOnlySurfaceTheme)] : []),
    ];
  }, [statusKey, mappingsKey, readOnly, validateVariableMappings]);

  const hasToolbar =
    !readOnly &&
    Boolean(
      showPreviewToggle ||
      toolbarStart ||
      toolbarActionsBeforePreview ||
      toolbarActions,
    );
  const activePreview = previewEnabled ? preview : undefined;

  return (
    <div className="flex flex-col">
      {/* Toolbar attached above the prompt; the editor's (or preview's) own
          top border draws the seam. */}
      {hasToolbar ? (
        <div
          className={cn(
            "bg-secondary text-secondary-foreground flex h-9 items-center justify-between gap-1 rounded-t-md border px-1.5",
            collapsed ? "rounded-b-md" : "border-b-transparent",
            onToolbarClick && "cursor-pointer",
          )}
          onClick={(event) => {
            if (!onToolbarClick) return;
            const target = event.target as HTMLElement;
            if (
              target.closest(
                "button, a, input, label, [role='button'], [role='menuitem'], [role='switch']",
              )
            )
              return;
            onToolbarClick();
          }}
        >
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
            {toolbarStart}
          </div>
          <div className="flex h-6 shrink-0 items-center gap-1">
            {toolbarActionsBeforePreview}
            {showPreviewToggle ? (
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
                  onCheckedChange={(checked) =>
                    onPreviewEnabledChange?.(checked)
                  }
                />
                Preview
              </label>
            ) : null}
            {toolbarActions}
          </div>
        </div>
      ) : null}

      {!collapsed ? (
        <div className="relative">
          <div
            className={cn(activePreview && "invisible")}
            aria-hidden={activePreview ? true : undefined}
          >
            <CodeMirrorEditor
              value={value}
              onChange={onChange}
              editable={!readOnly}
              mode="prompt"
              // Keep the editor mounted while previewing so it remains the
              // stable height anchor for both surfaces.
              minHeight={48}
              maxHeight="50dvh"
              lineNumbers={false}
              extensions={extensions}
              className={cn(hasToolbar && "rounded-t-none", "text-sm")}
            />
          </div>
          {activePreview ? (
            activePreview.status === "unavailable" ? (
              <p className="ph-no-capture bg-muted/50 text-muted-foreground absolute inset-0 overflow-y-auto rounded-b-md border px-3 py-2 text-sm leading-5">
                {activePreview.message}
              </p>
            ) : (
              <pre className="ph-no-capture bg-muted/50 text-card-foreground absolute inset-0 overflow-y-auto rounded-b-md border px-3 py-2 font-sans text-sm leading-5 whitespace-pre-wrap">
                {activePreview.fragments.map((fragment, index) => (
                  <Fragment key={index}>
                    {fragment.type === "text" ? (
                      renderPreviewText(fragment.text)
                    ) : (
                      <span
                        className="bg-primary-accent/10 dark:bg-accent-light-blue dark:text-accent-dark-blue rounded px-0.5"
                        title={`{{${fragment.name}}}`}
                      >
                        {renderPreviewText(fragment.value)}
                      </span>
                    )}
                  </Fragment>
                ))}
              </pre>
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
