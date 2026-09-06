import { useMemo, useState, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";

import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { MediaReferenceTag } from "@/src/components/ui/media/MediaReferenceTag";
import {
  classifyMediaValue,
  splitStringByMediaReferences,
} from "@/src/components/ui/media/mediaUtils";
import type {
  ActiveVariableMapping,
  VariableFieldState,
} from "@/src/features/evals/v2/types/variableMapping";
import { JsonPathEditor } from "../JsonPathEditor/JsonPathEditor";
import { SampleDataTreeSelector } from "../SampleDataTreeSelector/SampleDataTreeSelector";
import { VariableMappingCardShell } from "../VariableMappingCardShell";
import { VariableMappingBinding } from "../VariableMappingBinding/VariableMappingBinding";
import { buildJsonPathSuggestions } from "@/src/features/evals/v2/fns/variableMapping/buildJsonPathSuggestions";
import { evalVariableColumnLabel } from "@/src/features/evals/v2/fns/variableMapping/evalVariableColumnLabel";
import { extractVariableMappingValue } from "@/src/features/evals/v2/fns/variableMapping/extractVariableMappingValue";
import {
  jsonPathToSegments,
  segmentsToJsonPath,
  type PathSegment,
} from "@/src/features/evals/v2/fns/variableMapping/segmentsToJsonPath";
import {
  deepParseJsonIterative,
  experimentTargetEvalVariableColumns,
} from "@langfuse/shared";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";

const TOOL_CALLS_COLUMN_ID = "toolCalls";

const focusEditingSurface = (element: HTMLDivElement | null) => {
  element?.focus();
};

/**
 * The value a card's mapping resolves to in the sample — a proper viewer
 * (the JSON tree for structured values, clean pre-wrapped text otherwise),
 * no mid-text clamping. Visibility is controlled by the card header's
 * collapse toggle; error/empty notes render as always-visible rows instead.
 */
function MappedValuePreview({ value }: { value: string }) {
  const parsed = useMemo(() => deepParseJsonIterative(value), [value]);
  const isJson = parsed !== null && typeof parsed === "object";
  const mediaSegments = useMemo(() => {
    const descriptor = classifyMediaValue(value);
    return descriptor
      ? [{ type: "media" as const, descriptor }]
      : splitStringByMediaReferences(value);
  }, [value]);
  const hasMedia = mediaSegments.some((segment) => segment.type === "media");

  return (
    <div>
      {isJson ? (
        <PrettyJsonView
          json={parsed}
          currentView="pretty"
          isLoading={false}
          showNullValues={true}
          stickyTopLevelKey={false}
          showObservationTypeBadge={false}
          scrollable={true}
          className="max-h-96 [&_.border]:border-0 [&_.rounded-sm]:rounded-none"
        />
      ) : hasMedia ? (
        <div
          data-testid="mapped-media-preview"
          className="flex max-h-96 flex-wrap items-center gap-1 overflow-y-auto p-3 text-sm"
        >
          {mediaSegments.map((segment, index) =>
            segment.type === "media" ? (
              <MediaReferenceTag key={index} descriptor={segment.descriptor} />
            ) : (
              <span key={index} className="break-words whitespace-pre-wrap">
                {segment.value}
              </span>
            ),
          )}
        </div>
      ) : (
        <pre className="max-h-96 overflow-y-auto p-3 font-sans text-sm break-words whitespace-pre-wrap">
          {value}
        </pre>
      )}
    </div>
  );
}

function MappingPreviewSurface({
  variable,
  children,
  onEdit,
}: {
  variable: string;
  children: ReactNode;
  onEdit: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Change mapping for {{${variable}}}`}
      title={`Change mapping for {{${variable}}}`}
      className="hover:bg-muted/50 focus-visible:ring-ring cursor-pointer rounded-b-md transition-colors focus-visible:ring-2 focus-visible:outline-hidden focus-visible:ring-inset"
      onClick={(event) => {
        if (
          event.target instanceof Element &&
          event.target.closest("[data-media-tag]")
        ) {
          return;
        }
        onEdit();
      }}
      onKeyDown={(event) => {
        if (
          event.target instanceof Element &&
          event.target.closest("[data-media-tag]")
        ) {
          return;
        }
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onEdit();
        }
      }}
    >
      {children}
    </div>
  );
}

/**
 * The tree selector as a card body: click a node to bind and close (select
 * semantics), with guidance and the raw-JSONPath entry above the tree —
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
  const { selectedColumnId } = fieldState;

  // Both the tree and the path suggestions walk the whole sample, so they are
  // memoized against the sample and the selected field rather than the props
  // object the parent rebuilds on every render.
  const roots = useMemo(
    () =>
      experimentTargetEvalVariableColumns.map((column) => ({
        id: column.id,
        label: column.name,
        // Keep the top-level columns selectable without a sample so mappings
        // can still be configured before the first matching event exists.
        value: sourceObject
          ? column.id === TOOL_CALLS_COLUMN_ID
            ? sourceObject[column.id]
            : deepParseJsonIterative(sourceObject[column.id])
          : undefined,
      })),
    [sourceObject],
  );
  const suggestions = useMemo(
    () =>
      sourceObject && selectedColumnId
        ? buildJsonPathSuggestions(
            selectedColumnId === TOOL_CALLS_COLUMN_ID
              ? sourceObject[selectedColumnId]
              : deepParseJsonIterative(sourceObject[selectedColumnId]),
          )
        : [],
    [sourceObject, selectedColumnId],
  );

  if (pathEditing && selectedColumnId) {
    return (
      <JsonPathEditor
        initialPath={fieldState.jsonSelector ?? "$"}
        suggestions={suggestions}
        onApply={onApplyJsonPath}
        onCancel={() => setPathEditing(false)}
      />
    );
  }

  const treeGuidance = `Click rows to open them — hover one and press "Use" to bind {{${variable}}}.`;

  return (
    <>
      {!sourceObject ? (
        <p className="text-muted-foreground border-b p-3 text-sm">
          {sourceUnavailableMessage ??
            (hasMatchingObservations
              ? "Loading sample data…"
              : "No observations match the current rule — mapping can be configured, but JSON paths cannot be validated yet.")}
        </p>
      ) : null}
      <div className="flex min-w-0 items-center justify-between gap-2 border-b px-3 py-1.5">
        <p
          className="text-muted-foreground min-w-0 truncate text-xs"
          title={treeGuidance}
        >
          {treeGuidance}
        </p>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground shrink-0 text-xs underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!selectedColumnId}
          title={
            selectedColumnId
              ? "Enter a raw JSONPath (filters, slices, …)"
              : "Pick a field in the tree first, then refine it as a path."
          }
          onClick={() => setPathEditing(true)}
        >
          Type a JSONPath instead
        </button>
      </div>
      <SampleDataTreeSelector
        variable={variable}
        currentColumnId={selectedColumnId}
        currentSegments={segments}
        roots={roots}
        onSelect={onSelect}
      />
    </>
  );
}

/**
 * One mapping card per variable: header = "{{variable}} maps to <crumbs>"
 * with the pencil as the single edit affordance (plus trash), body = the
 * resolved value preview. The pencil or preview body flips the body into the
 * point-at-data tree, where one click binds and closes.
 */
function VariableMappingRow({
  variable,
  unmapped,
  expanded,
  editing,
  onExpandedChange,
  onEditingChange,
  fieldState,
  sourceObject,
  hasMatchingObservations,
  unvalidatedSourceColumnIds,
  sourceUnavailableMessage,
  onChange,
  onDelete,
}: {
  variable: string;
  unmapped: boolean;
  expanded: boolean;
  editing: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onEditingChange: (editing: boolean) => void;
  fieldState: VariableFieldState;
  sourceObject: Record<string, unknown> | null;
  hasMatchingObservations: boolean;
  unvalidatedSourceColumnIds: string[];
  sourceUnavailableMessage?: string;
  onChange: (next: VariableFieldState) => void;
  onDelete?: () => void;
}) {
  const capture = usePostHogClientCapture();
  const segments = useMemo(
    () =>
      fieldState.jsonSelector
        ? jsonPathToSegments(fieldState.jsonSelector)
        : [],
    [fieldState.jsonSelector],
  );

  const columnLabel = evalVariableColumnLabel(fieldState.selectedColumnId);
  const validationUnavailable = fieldState.selectedColumnId
    ? unvalidatedSourceColumnIds.includes(fieldState.selectedColumnId)
    : false;

  const extracted = useMemo(() => {
    if (unmapped || !fieldState.selectedColumnId) return null;
    if (validationUnavailable) return null;
    if (!sourceObject) return null;
    const { value, error } = extractVariableMappingValue(
      sourceObject,
      fieldState.selectedColumnId,
      fieldState.jsonSelector ?? undefined,
    );
    return error
      ? { value: null, error: error.message }
      : { value, error: null };
  }, [unmapped, fieldState, sourceObject, validationUnavailable]);
  const warningMessage =
    extracted?.error ??
    (sourceObject && extracted && !extracted.value
      ? "This mapping is empty in the selected sample."
      : null);

  const body = editing ? (
    <TreeSelectorBody
      variable={variable}
      fieldState={fieldState}
      segments={segments}
      sourceObject={sourceObject}
      hasMatchingObservations={hasMatchingObservations}
      sourceUnavailableMessage={sourceUnavailableMessage}
      onSelect={(columnId, treeSegments) => {
        const jsonSelector = segmentsToJsonPath(treeSegments);
        if (
          columnId !== fieldState.selectedColumnId ||
          jsonSelector !== fieldState.jsonSelector
        ) {
          capture("evaluators:variable_mapping_configured", {
            method: "tree",
          });
        }
        onChange({
          selectedColumnId: columnId,
          jsonSelector,
        });
        // Select semantics: one click binds and the card flips back;
        // the updated preview is the confirmation.
        onEditingChange(false);
      }}
      onApplyJsonPath={(jsonSelector) => {
        if (jsonSelector !== fieldState.jsonSelector) {
          capture("evaluators:variable_mapping_configured", {
            method: "json_path",
          });
        }
        onChange({
          selectedColumnId: fieldState.selectedColumnId,
          jsonSelector,
        });
        onEditingChange(false);
      }}
    />
  ) : !expanded ? null : (
    <MappingPreviewSurface
      variable={variable}
      onEdit={() => onEditingChange(true)}
    >
      {unmapped ? (
        <div className="text-dark-yellow flex w-full items-start gap-1.5 p-3 text-left text-sm">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {`{{${variable}}} is not mapped yet — click to choose the data it pulls in.`}
        </div>
      ) : !sourceObject ? (
        <p className="text-muted-foreground p-3 text-sm">
          {sourceUnavailableMessage ??
            "Pick a sample in the right pane to preview the value this mapping pulls in."}
        </p>
      ) : validationUnavailable ? (
        <p className="text-muted-foreground p-3 text-sm">
          No sample value is available to preview this mapping yet.
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
    </MappingPreviewSurface>
  );

  return (
    <VariableMappingCardShell
      variable={variable}
      mapping={
        !unmapped && columnLabel ? (
          <VariableMappingBinding
            columnLabel={columnLabel}
            jsonSelector={fieldState.jsonSelector}
          />
        ) : undefined
      }
      isUnmapped={unmapped || !columnLabel}
      warningMessage={warningMessage}
      isExpanded={expanded}
      isEditing={editing}
      onExpandedChange={onExpandedChange}
      onEditingChange={onEditingChange}
      onDelete={onDelete}
    >
      {editing ? (
        <div ref={focusEditingSurface} tabIndex={-1} className="outline-hidden">
          {body}
        </div>
      ) : (
        body
      )}
    </VariableMappingCardShell>
  );
}

export type EditableVariableMappingProps = {
  /** Prompt variables and their current bindings, in prompt order. */
  mappings: Array<{ variable: string; fieldState: VariableFieldState }>;
  activeMapping: ActiveVariableMapping;
  onActiveMappingChange: (activeMapping: ActiveVariableMapping) => void;
  onChangeField: (variable: string, next: VariableFieldState) => void;
  /** Removes the variable from the prompt (trash action on the card). */
  onDeleteVariable?: (variable: string) => void;
  /** The sample observation every variable maps against. */
  sourceObject: Record<string, unknown> | null;
  /** False when the rule matches nothing — drives the empty state. */
  hasMatchingObservations: boolean;
  /** Selected source columns that have no value in this sample and cannot be validated. */
  unvalidatedSourceColumnIds?: string[];
  sourceUnavailableMessage?: string;
};

export function EditableVariableMapping({
  mappings,
  activeMapping,
  onActiveMappingChange,
  onChangeField,
  onDeleteVariable,
  sourceObject,
  hasMatchingObservations,
  unvalidatedSourceColumnIds = [],
  sourceUnavailableMessage,
}: EditableVariableMappingProps) {
  return (
    <div data-variable-mapping-root="" className="flex flex-col gap-4">
      {mappings.map((item) => (
        <VariableMappingRow
          key={item.variable}
          variable={item.variable}
          unmapped={!item.fieldState.selectedColumnId}
          expanded={
            activeMapping?.variable === item.variable &&
            activeMapping.state === "preview"
          }
          editing={
            activeMapping?.variable === item.variable &&
            activeMapping.state === "editing"
          }
          onExpandedChange={(expanded) =>
            onActiveMappingChange(
              expanded ? { variable: item.variable, state: "preview" } : null,
            )
          }
          onEditingChange={(editing) =>
            onActiveMappingChange({
              variable: item.variable,
              state: editing ? "editing" : "preview",
            })
          }
          fieldState={item.fieldState}
          sourceObject={sourceObject}
          hasMatchingObservations={hasMatchingObservations}
          unvalidatedSourceColumnIds={unvalidatedSourceColumnIds}
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
