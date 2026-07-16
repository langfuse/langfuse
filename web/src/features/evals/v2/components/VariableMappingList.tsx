import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Pencil,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import {
  MAPPABLE_COLUMNS,
  type VariableFieldState,
} from "@/src/features/evals/v2/components/VariableMappingPopover";
import {
  JsonPathEditor,
  VariableMappingPanel,
} from "@/src/features/evals/v2/components/VariableMappingPanel";
import { SampleDataTreeSelector } from "@/src/features/evals/v2/components/VariableMappingTree";
import {
  buildJsonPathSuggestions,
  tryParseJson,
} from "@/src/features/evals/v2/lib/jsonPathSuggestions";
import {
  WILDCARD,
  crumbLabel,
  jsonPathToSegments,
  segmentsToJsonPath,
  type PathSegment,
} from "@/src/features/evals/v2/lib/jsonPathSegments";
import { cn } from "@/src/utils/tailwind";
import { extractValueFromObjectAsString } from "@langfuse/shared";

/** Which surface the pencil expands into. */
export type MappingSelectorKind = "tree" | "drill";

/**
 * The value a card's mapping resolves to in the sample — a proper viewer
 * (the JSON tree for structured values, clean pre-wrapped text otherwise),
 * no mid-text clamping. Visibility is controlled by the card header's
 * collapse toggle; error/empty notes render as always-visible rows instead.
 */
function MappedValuePreview({ value }: { value: string }) {
  const parsed = useMemo(() => tryParseJson(value), [value]);
  const isJson = parsed !== null && typeof parsed === "object";

  return isJson ? (
    <div className="max-h-96 overflow-y-auto">
      <PrettyJsonView
        json={parsed}
        currentView="pretty"
        isLoading={false}
        showNullValues={true}
        stickyTopLevelKey={false}
        showObservationTypeBadge={false}
        className="[&_.border]:border-0 [&_.rounded-sm]:rounded-none"
      />
    </div>
  ) : (
    <pre className="max-h-96 overflow-y-auto p-3 font-sans text-sm break-words whitespace-pre-wrap">
      {value}
    </pre>
  );
}

/**
 * The card header's binding as crumbs — display, not a trigger. Array
 * segments are the one exception: inline [0] ↔ [*] toggles, so
 * wildcard-vs-index is fixable without opening the selector.
 */
function BindingCrumbs({
  columnLabel,
  segments,
  jsonSelector,
  onToggleSegment,
}: {
  columnLabel: string;
  /** null = custom path the crumbs can't express. */
  segments: PathSegment[] | null;
  jsonSelector: string | null;
  onToggleSegment: (index: number) => void;
}) {
  if (segments === null) {
    return (
      <span
        className="min-w-0 truncate font-mono text-sm"
        title={`${columnLabel}: ${jsonSelector ?? ""} — custom path`}
      >
        {columnLabel}: {jsonSelector}
      </span>
    );
  }
  // Every crumb shares the header's text-sm — mixing sizes here (xs mono vs
  // sm label) puts the pieces on different baselines and reads as broken
  // vertical alignment.
  return (
    <span className="flex min-w-0 flex-wrap items-baseline gap-1">
      <span className="shrink-0 font-medium">{columnLabel}</span>
      {segments.map((segment, index) => {
        const isArraySegment =
          segment === WILDCARD || typeof segment === "number";
        return (
          <span key={index} className="flex items-baseline gap-1">
            <ChevronRight className="text-muted-foreground h-3 w-3 shrink-0 self-center" />
            {isArraySegment ? (
              <button
                type="button"
                className="hover:bg-accent rounded px-1 font-mono text-sm font-medium underline decoration-dotted underline-offset-2"
                title={
                  segment === WILDCARD
                    ? "Every entry — click to switch to the first entry only"
                    : `Entry ${String(segment)} only — click to switch to every entry`
                }
                onClick={() => onToggleSegment(index)}
              >
                {crumbLabel(segment)}
              </button>
            ) : (
              <span
                className="max-w-40 truncate font-mono text-sm"
                title={crumbLabel(segment)}
              >
                {crumbLabel(segment)}
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

/**
 * Drill-down selector with draft semantics: navigating browses a LOCAL copy
 * of the binding — the committed mapping (and its preview) only changes on
 * the explicit "Use this mapping" confirm, and Cancel discards. The panel's
 * own crumb header doubles as the navigation, so the card header above hides
 * its crumbs while open instead of repeating them.
 */
function DrillSelector({
  variable,
  initial,
  sourceObject,
  hasMatchingObservations,
  onCommit,
  onCancel,
}: {
  variable: string;
  initial: VariableFieldState;
  sourceObject: Record<string, unknown> | null;
  hasMatchingObservations: boolean;
  onCommit: (next: VariableFieldState) => void;
  onCancel: () => void;
}) {
  // Mounted fresh per open (conditional render), so the draft starts from
  // the committed binding each time.
  const [draft, setDraft] = useState<VariableFieldState>(initial);
  const dirty =
    draft.selectedColumnId !== initial.selectedColumnId ||
    (draft.jsonSelector ?? null) !== (initial.jsonSelector ?? null);

  return (
    <div className="flex flex-col">
      <VariableMappingPanel
        className="h-80"
        activeVariable={variable}
        fieldState={draft}
        overview={[]}
        onSelectVariable={() => undefined}
        sourceObject={sourceObject}
        hasMatchingObservations={hasMatchingObservations}
        onChange={setDraft}
      />
      <div className="flex items-center justify-end gap-2 border-t p-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!draft.selectedColumnId}
          title={
            !draft.selectedColumnId
              ? "Pick a field first."
              : dirty
                ? `Bind {{${variable}}} to this data`
                : "Unchanged — keeps the current mapping"
          }
          onClick={() => onCommit(draft)}
        >
          Use this mapping
        </Button>
      </div>
    </div>
  );
}

/**
 * The tree selector as a card body: click a node to bind and close (select
 * semantics), with the raw-JSONPath entry folded inside as a footer link —
 * the card header keeps exactly one edit affordance (the pencil).
 */
function TreeSelectorBody({
  variable,
  fieldState,
  segments,
  sourceObject,
  hasMatchingObservations,
  onSelect,
  onApplyJsonPath,
}: {
  variable: string;
  fieldState: VariableFieldState;
  segments: PathSegment[] | null;
  sourceObject: Record<string, unknown> | null;
  hasMatchingObservations: boolean;
  onSelect: (columnId: string, segments: PathSegment[]) => void;
  onApplyJsonPath: (jsonSelector: string | null) => void;
}) {
  const [pathEditing, setPathEditing] = useState(false);

  if (!sourceObject) {
    return (
      <p className="text-muted-foreground p-4 text-center text-sm">
        {hasMatchingObservations
          ? "Loading sample data…"
          : "No observations match the current scope — adjust the filters in step 2."}
      </p>
    );
  }

  if (pathEditing && fieldState.selectedColumnId) {
    return (
      <JsonPathEditor
        initialPath={fieldState.jsonSelector ?? "$"}
        suggestions={buildJsonPathSuggestions(
          sourceObject[fieldState.selectedColumnId],
        )}
        onApply={onApplyJsonPath}
        onCancel={() => setPathEditing(false)}
      />
    );
  }

  return (
    <>
      <SampleDataTreeSelector
        variable={variable}
        currentColumnId={fieldState.selectedColumnId}
        currentSegments={segments}
        sourceObject={sourceObject}
        onSelect={onSelect}
      />
      <div className="flex min-w-0 items-center justify-between gap-2 border-t px-3 py-1.5">
        <p
          className="text-muted-foreground min-w-0 truncate text-xs"
          title={`Click rows to open them — hover one and press "Use" to bind {{${variable}}} (values bind on click).`}
        >
          {`Click rows to open them — hover one and press "Use" to bind {{${variable}}} (values bind on click).`}
        </p>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground shrink-0 text-xs underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!fieldState.selectedColumnId}
          title={
            fieldState.selectedColumnId
              ? "Enter a raw JSONPath (filters, slices, …)"
              : "Pick a field in the tree first, then refine it as a path."
          }
          onClick={() => setPathEditing(true)}
        >
          Type a JSONPath instead
        </button>
      </div>
    </>
  );
}

/**
 * One mapping card per variable: header = "{{variable}} pulls from <crumbs>"
 * with the pencil as the single edit affordance (plus trash), body = the
 * resolved value preview. The pencil flips the body into the selector — the
 * point-at-data tree (default, click binds and closes) or the drill-down
 * (browse a draft, confirm). Information-first: nothing else in the card is
 * clickable except the [i] ↔ [*] crumb toggles.
 */
function VariableMappingRow({
  variable,
  unmapped,
  open,
  onOpenChange,
  revealSignal,
  selector,
  fieldState,
  sourceObject,
  hasMatchingObservations,
  onChange,
  onDelete,
}: {
  variable: string;
  unmapped: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Reveal request from a prompt token click: scroll here and expand the
      value preview (not the selector). */
  revealSignal?: { variable: string; nonce: number } | null;
  selector: MappingSelectorKind;
  fieldState: VariableFieldState;
  sourceObject: Record<string, unknown> | null;
  hasMatchingObservations: boolean;
  onChange: (next: VariableFieldState) => void;
  onDelete: () => void;
}) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  // The value preview is collapsed by default; the card header toggles it.
  const [previewOpen, setPreviewOpen] = useState(false);

  // Activated from outside (inserting a new variable, warning links): bring
  // the card into view so the inline selector is on screen.
  useEffect(() => {
    if (open) {
      rowRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [open]);

  // Prompt token clicked: reveal — scroll to the card and open its preview.
  useEffect(() => {
    if (!revealSignal || revealSignal.variable !== variable) return;
    setPreviewOpen(true);
    rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [revealSignal, variable]);

  // Clicking away from the open card closes it and discards any in-progress
  // change (the selector unmounts, taking drill drafts and half-typed paths
  // with it — bindings only commit on explicit selections). Clicks inside
  // portaled overlays (select menus etc.) land outside the app root and are
  // ignored.
  useEffect(() => {
    if (!open) return;
    const handler = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const appRoot = document.getElementById("__next");
      if (appRoot && !appRoot.contains(target)) return;
      if (rowRef.current?.contains(target)) return;
      onOpenChange(false);
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [open, onOpenChange]);

  const segments = useMemo(
    () =>
      fieldState.jsonSelector
        ? jsonPathToSegments(fieldState.jsonSelector)
        : [],
    [fieldState.jsonSelector],
  );

  const columnLabel = fieldState.selectedColumnId
    ? (MAPPABLE_COLUMNS.find((col) => col.id === fieldState.selectedColumnId)
        ?.label ?? fieldState.selectedColumnId)
    : null;

  const extracted = useMemo(() => {
    if (unmapped || !fieldState.selectedColumnId) return null;
    if (!sourceObject) return null;
    const { value, error } = extractValueFromObjectAsString(
      sourceObject,
      fieldState.selectedColumnId,
      fieldState.jsonSelector ?? undefined,
    );
    return error
      ? { value: null, error: error.message }
      : { value, error: null };
  }, [unmapped, fieldState, sourceObject]);

  /** Flip an array segment between a concrete index and [*]. */
  const toggleSegment = (index: number) => {
    if (segments === null) return;
    const next = [...segments];
    next[index] = next[index] === WILDCARD ? 0 : WILDCARD;
    onChange({
      selectedColumnId: fieldState.selectedColumnId,
      jsonSelector: segmentsToJsonPath(next),
    });
  };

  // Every card collapses to its header the same way — mapped, unmapped,
  // empty, or error alike (the header already carries the state).
  const canToggle = !open;
  const bodyVisible = open || previewOpen;

  return (
    <div ref={rowRef} className="flex flex-col rounded-md border">
      {/* Header: the mapping as information, and the collapse toggle for the
          card body — inner buttons (crumb toggles, pencil, trash) don't
          bubble into the toggle. The pencil is the one way into the selector. */}
      <div
        className={cn(
          "bg-muted/30 flex min-w-0 items-center gap-2 rounded-t-md px-3 py-1.5 text-sm",
          bodyVisible ? "border-b" : "rounded-b-md",
          canToggle && "cursor-pointer",
        )}
        role={canToggle ? "button" : undefined}
        tabIndex={canToggle ? 0 : undefined}
        aria-expanded={canToggle ? previewOpen : undefined}
        title={
          canToggle
            ? previewOpen
              ? "Hide the details"
              : "Show the details"
            : undefined
        }
        onClick={(event) => {
          if (!canToggle) return;
          if ((event.target as Element).closest("button")) return;
          setPreviewOpen((prev) => !prev);
        }}
        onKeyDown={(event) => {
          if (!canToggle) return;
          if (event.key !== "Enter" && event.key !== " ") return;
          if ((event.target as Element).closest("button")) return;
          event.preventDefault();
          setPreviewOpen((prev) => !prev);
        }}
      >
        <ChevronDown
          className={cn(
            "text-muted-foreground h-3.5 w-3.5 shrink-0 transition-transform",
            !previewOpen && "-rotate-90",
            !canToggle && "invisible",
          )}
        />
        <span
          className="text-primary-accent shrink-0 font-mono font-medium"
          title={`{{${variable}}}`}
        >
          {`{{${variable}}}`}
        </span>
        <span className="text-muted-foreground shrink-0">pulls from</span>
        {open && selector === "drill" ? (
          // The drill panel's crumb header is the navigation while open —
          // don't repeat it here.
          <span
            className="text-muted-foreground truncate italic"
            title="Confirm below with “Use this mapping”, or cancel"
          >
            choosing below…
          </span>
        ) : unmapped || !columnLabel ? (
          <span className="text-dark-yellow flex min-w-0 items-center gap-1.5 font-medium">
            <TriangleAlert className="h-4 w-4 shrink-0" />
            <span className="truncate" title="Not mapped yet">
              nothing yet
            </span>
          </span>
        ) : (
          <BindingCrumbs
            columnLabel={columnLabel}
            segments={segments}
            jsonSelector={fieldState.jsonSelector}
            onToggleSegment={toggleSegment}
          />
        )}
        <span className="ml-auto flex shrink-0 items-center">
          {/* Edit ↔ cancel: the pencil opens the selector and becomes an X
              while it's open — closing discards any in-progress choice. */}
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className={cn(open && "bg-accent text-foreground")}
            title={
              open ? "Cancel — keep the current mapping" : "Change the mapping"
            }
            aria-expanded={open}
            onClick={() => onOpenChange(!open)}
          >
            {open ? (
              <X className="h-3.5 w-3.5" />
            ) : (
              <Pencil className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="hover:text-destructive"
            title={`Remove {{${variable}}} from the prompt`}
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </span>
      </div>

      {/* Body: the selector while editing; otherwise warnings always show,
          and the value preview only when the header is expanded. */}
      {open ? (
        selector === "drill" ? (
          <DrillSelector
            variable={variable}
            initial={fieldState}
            sourceObject={sourceObject}
            hasMatchingObservations={hasMatchingObservations}
            onCommit={(next) => {
              onChange(next);
              onOpenChange(false);
            }}
            onCancel={() => onOpenChange(false)}
          />
        ) : (
          <TreeSelectorBody
            variable={variable}
            fieldState={fieldState}
            segments={segments}
            sourceObject={sourceObject}
            hasMatchingObservations={hasMatchingObservations}
            onSelect={(columnId, treeSegments) => {
              onChange({
                selectedColumnId: columnId,
                jsonSelector: segmentsToJsonPath(treeSegments),
              });
              // Select semantics: one click binds and the card flips back;
              // the updated preview is the confirmation.
              onOpenChange(false);
            }}
            onApplyJsonPath={(jsonSelector) => {
              onChange({
                selectedColumnId: fieldState.selectedColumnId,
                jsonSelector,
              });
              onOpenChange(false);
            }}
          />
        )
      ) : !previewOpen ? null : unmapped ? (
        <div className="text-dark-yellow flex items-start gap-1.5 p-3 text-sm">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {`{{${variable}}} is not mapped yet — use the pencil to pick the data it pulls in.`}
        </div>
      ) : !sourceObject ? (
        <p className="text-muted-foreground p-3 text-sm">
          Pick a sample in step 2 to preview the value this mapping pulls in.
        </p>
      ) : extracted?.error ? (
        <div className="text-dark-yellow flex items-start gap-1.5 p-3 text-sm">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {extracted.error}
        </div>
      ) : !extracted?.value ? (
        <p className="text-muted-foreground p-3 text-sm italic">
          empty in the sample
        </p>
      ) : (
        <MappedValuePreview value={extracted.value} />
      )}
    </div>
  );
}

/**
 * Mapping step: one card per prompt {{variable}} — mapping crumbs + live
 * value preview as information, the pencil as the single way into the
 * selector (tree by default, drill-down as the alternate mode). Prompt pills
 * activate the same cards (controlled via activeVariable).
 */
export function VariableMappingList({
  overview,
  activeVariable,
  onActiveVariableChange,
  revealSignal = null,
  selector = "tree",
  getFieldState,
  onChangeField,
  onDeleteVariable,
  sourceObject,
  hasMatchingObservations,
}: {
  /** Every prompt variable with its mapping label, in prompt order. */
  overview: Array<{ variable: string; label: string; unmapped: boolean }>;
  activeVariable: string | null;
  onActiveVariableChange: (variable: string | null) => void;
  /** Reveal request from a prompt token click: the matching card scrolls
      into view and expands its value preview (nonce re-fires repeats). */
  revealSignal?: { variable: string; nonce: number } | null;
  /** Expanded surface: point-at-data tree (default) or classic drill-down. */
  selector?: MappingSelectorKind;
  getFieldState: (variable: string) => VariableFieldState;
  onChangeField: (variable: string, next: VariableFieldState) => void;
  /** Removes the variable from the prompt (trash action on the card). */
  onDeleteVariable: (variable: string) => void;
  /** The sample observation every variable maps against. */
  sourceObject: Record<string, unknown> | null;
  /** False when the scope matches nothing — drives the empty state. */
  hasMatchingObservations: boolean;
}) {
  if (overview.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {
          "Add a {{variable}} to the prompt to pull in the data being evaluated."
        }
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {overview.map((item) => (
        <VariableMappingRow
          key={item.variable}
          variable={item.variable}
          unmapped={item.unmapped}
          open={activeVariable === item.variable}
          onOpenChange={(open) =>
            onActiveVariableChange(open ? item.variable : null)
          }
          revealSignal={revealSignal}
          selector={selector}
          fieldState={getFieldState(item.variable)}
          sourceObject={sourceObject}
          hasMatchingObservations={hasMatchingObservations}
          onChange={(next) => onChangeField(item.variable, next)}
          onDelete={() => onDeleteVariable(item.variable)}
        />
      ))}
    </div>
  );
}
