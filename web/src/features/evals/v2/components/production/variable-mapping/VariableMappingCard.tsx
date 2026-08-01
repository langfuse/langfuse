import { useMemo, useRef, useState } from "react";
import { ChevronRight, TriangleAlert } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import {
  MAPPABLE_COLUMNS,
  type VariableFieldState,
} from "@/src/features/evals/v2/components/VariableMappingPopover";
import { VariableMappingPanel } from "@/src/features/evals/v2/components/VariableMappingPanel";
import { JsonPathEditor } from "@/src/features/evals/v2/components/production/variable-mapping/JsonPathEditor";
import { SampleDataTreeSelector } from "@/src/features/evals/v2/components/production/variable-mapping/SampleDataTreeSelector";
import { VariableMappingCardShell } from "./VariableMappingCardShell";
import {
  buildJsonPathSuggestions,
  tryParseJson,
} from "@/src/features/evals/v2/lib/jsonPathSuggestions";
import {
  LAST,
  WILDCARD,
  crumbLabel,
  jsonPathToSegments,
  segmentsToJsonPath,
  type PathSegment,
} from "@/src/features/evals/v2/lib/jsonPathSegments";
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

  return (
    <div className="p-2.5">
      <div className="border-primary-accent/40 bg-background overflow-hidden rounded-sm border-l-2">
        {isJson ? (
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
        )}
      </div>
    </div>
  );
}

/**
 * The card header's binding as crumbs — display, not a trigger. Array
 * segments are the one exception: inline array selection toggles let users
 * switch among the first entry, every entry, and the dynamic last entry.
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
      <span className="shrink-0 font-bold">{columnLabel}</span>
      {segments.map((segment, index) => {
        const isArraySegment =
          segment === WILDCARD ||
          segment === LAST ||
          typeof segment === "number";
        return (
          <span key={index} className="flex items-baseline gap-1">
            <ChevronRight className="text-muted-foreground h-3 w-3 shrink-0 self-center" />
            {isArraySegment ? (
              <button
                type="button"
                className="hover:bg-accent rounded px-1 font-mono text-sm font-bold underline decoration-dotted underline-offset-2"
                title={
                  segment === WILDCARD
                    ? "Every entry — click to switch to the last entry"
                    : segment === LAST
                      ? "Last entry — click to switch to the first entry"
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
  sourceUnavailableMessage,
  onCommit,
  onCancel,
}: {
  variable: string;
  initial: VariableFieldState;
  sourceObject: Record<string, unknown> | null;
  hasMatchingObservations: boolean;
  sourceUnavailableMessage?: string;
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
        sourceUnavailableMessage={sourceUnavailableMessage}
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
  sourceUnavailableMessage,
  onSelect,
  onApplyJsonPath,
}: {
  variable: string;
  fieldState: VariableFieldState;
  segments: PathSegment[] | null;
  sourceObject: Record<string, unknown> | null;
  hasMatchingObservations: boolean;
  sourceUnavailableMessage?: string;
  onSelect: (columnId: string, segments: PathSegment[]) => void;
  onApplyJsonPath: (jsonSelector: string | null) => void;
}) {
  const [pathEditing, setPathEditing] = useState(false);

  if (!sourceObject) {
    return (
      <p className="text-muted-foreground p-4 text-center text-sm">
        {sourceUnavailableMessage ??
          (hasMatchingObservations
            ? "Loading sample data…"
            : "No observations match the current rule — adjust the filters in the right pane.")}
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
  selector,
  fieldState,
  sourceObject,
  hasMatchingObservations,
  sourceUnavailableMessage,
  onChange,
  onDelete,
}: {
  variable: string;
  unmapped: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selector: MappingSelectorKind;
  fieldState: VariableFieldState;
  sourceObject: Record<string, unknown> | null;
  hasMatchingObservations: boolean;
  sourceUnavailableMessage?: string;
  onChange: (next: VariableFieldState) => void;
  onDelete?: () => void;
}) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  // The value preview is collapsed by default; the card header toggles it.
  const [previewOpen, setPreviewOpen] = useState(false);

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

  /** Cycle an array segment through every entry, last entry, and first entry. */
  const toggleSegment = (index: number) => {
    if (segments === null) return;
    const next = [...segments];
    next[index] =
      next[index] === WILDCARD ? LAST : next[index] === LAST ? 0 : WILDCARD;
    onChange({
      selectedColumnId: fieldState.selectedColumnId,
      jsonSelector: segmentsToJsonPath(next),
    });
  };

  const body = open ? (
    selector === "drill" ? (
      <DrillSelector
        variable={variable}
        initial={fieldState}
        sourceObject={sourceObject}
        hasMatchingObservations={hasMatchingObservations}
        sourceUnavailableMessage={sourceUnavailableMessage}
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
        sourceUnavailableMessage={sourceUnavailableMessage}
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
      {sourceUnavailableMessage ??
        "Pick a sample in the right pane to preview the value this mapping pulls in."}
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
  );

  if (open && selector === "drill") {
    return (
      <div ref={rowRef} className="bg-card flex flex-col rounded-md border">
        {body}
      </div>
    );
  }

  return (
    <div ref={rowRef}>
      <VariableMappingCardShell
        variable={variable}
        mapping={
          !unmapped && columnLabel ? (
            <BindingCrumbs
              columnLabel={columnLabel}
              segments={segments}
              jsonSelector={fieldState.jsonSelector}
              onToggleSegment={toggleSegment}
            />
          ) : undefined
        }
        isUnmapped={unmapped || !columnLabel}
        isExpanded={previewOpen}
        isEditing={open}
        onExpandedChange={setPreviewOpen}
        onEditingChange={onOpenChange}
        onDelete={onDelete}
      >
        {body}
      </VariableMappingCardShell>
    </div>
  );
}

/**
 * Mapping step: one card per prompt {{variable}} — mapping crumbs + live
 * value preview as information, the pencil as the single way into the
 * selector (tree by default, drill-down as the alternate mode). Prompt pills
 * activate the same cards (controlled via activeVariable).
 */
export function VariableMappingCard({
  overview,
  activeVariable,
  onActiveVariableChange,
  selector = "tree",
  getFieldState,
  onChangeField,
  onDeleteVariable,
  sourceObject,
  hasMatchingObservations,
  sourceUnavailableMessage,
}: {
  /** Every prompt variable with its mapping label, in prompt order. */
  overview: Array<{ variable: string; label: string; unmapped: boolean }>;
  activeVariable: string | null;
  onActiveVariableChange: (variable: string | null) => void;
  /** Expanded surface: point-at-data tree (default) or classic drill-down. */
  selector?: MappingSelectorKind;
  getFieldState: (variable: string) => VariableFieldState;
  onChangeField: (variable: string, next: VariableFieldState) => void;
  /** Removes the variable from the prompt (trash action on the card). */
  onDeleteVariable?: (variable: string) => void;
  /** The sample observation every variable maps against. */
  sourceObject: Record<string, unknown> | null;
  /** False when the rule matches nothing — drives the empty state. */
  hasMatchingObservations: boolean;
  sourceUnavailableMessage?: string;
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
          selector={selector}
          fieldState={getFieldState(item.variable)}
          sourceObject={sourceObject}
          hasMatchingObservations={hasMatchingObservations}
          sourceUnavailableMessage={sourceUnavailableMessage}
          onChange={(next) => onChangeField(item.variable, next)}
          onDelete={
            onDeleteVariable ? () => onDeleteVariable(item.variable) : undefined
          }
        />
      ))}
    </div>
  );
}
