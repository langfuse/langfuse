import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  MousePointerClick,
  Pencil,
  Trash2,
  TriangleAlert,
} from "lucide-react";

import { Button } from "@/src/components/ui/button";
import {
  MAPPABLE_COLUMNS,
  type VariableFieldState,
} from "@/src/features/evals/v2/components/VariableMappingPopover";
import {
  JsonPathEditor,
  previewOf,
  typeBadge,
} from "@/src/features/evals/v2/components/VariableMappingPanel";
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
import { cn } from "@/src/utils/tailwind";
import { extractValueFromObjectAsString } from "@langfuse/shared";

// Concrete array entries shown before the "+N more" note ([*] covers the
// common case; a specific deep index is the JSONPath editor's job).
const MAX_CONCRETE_ENTRIES = 5;
// Entries sampled to build the [*] representative shape (union of keys).
const WILDCARD_SHAPE_SAMPLE = 10;
// Row tooltips carry the full-ish value; cap so huge payloads don't build
// megabyte title attributes.
const TITLE_PREVIEW_MAX = 700;

/** Stable key for a tree position (column root + drill segments). */
export function pathKey(columnId: string, segments: PathSegment[]): string {
  if (segments.includes(LAST)) {
    return pathKey(
      columnId,
      segments.map((segment) => (segment === LAST ? "\u0000last" : segment)),
    );
  }

  return [
    columnId,
    ...segments.map((s) =>
      s === WILDCARD ? "\0*" : typeof s === "number" ? `\0${s}` : s,
    ),
  ].join("\x01");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Representative shape under an array's [*] node: the union of keys across
 * the first sampled object entries (so heterogeneous lists don't hide
 * fields), with the keys missing from some entries flagged. Scalar/array
 * entries fall back to the first entry as the representative.
 */
function wildcardRepresentative(entries: unknown[]): {
  value: unknown;
  partialKeys: Set<string>;
} {
  const objects = entries.slice(0, WILDCARD_SHAPE_SAMPLE).filter(isPlainObject);
  if (objects.length === 0) {
    return { value: entries[0], partialKeys: new Set() };
  }
  const merged: Record<string, unknown> = {};
  const counts = new Map<string, number>();
  for (const entry of objects) {
    for (const [key, value] of Object.entries(entry)) {
      if (!(key in merged)) merged[key] = value;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const partialKeys = new Set(
    Array.from(counts.entries())
      .filter(([, count]) => count < objects.length)
      .map(([key]) => key),
  );
  return { value: merged, partialKeys };
}

type TreeRowProps = {
  columnId: string;
  segments: PathSegment[];
  label: string;
  value: unknown;
  badge?: string;
  depth: number;
  /** Key not present in every sampled entry of the enclosing [*]. */
  partial?: boolean;
  /** For a [*] row: which representative keys are partial (per entry). */
  partialChildKeys?: Set<string>;
  armedVariable: string | null;
  expanded: Set<string>;
  onToggleExpand: (key: string) => void;
  boundChips: Map<string, string[]>;
  onBind: (columnId: string, segments: PathSegment[]) => void;
  /** The currently-bound node (single-variable selector): gets a subtle
      background so users open the tree "where they are". */
  highlightKey?: string | null;
};

/** One tree row plus (when expanded) its children. */
function TreeRow({
  columnId,
  segments,
  label,
  value,
  badge,
  depth,
  partial = false,
  partialChildKeys,
  armedVariable,
  expanded,
  onToggleExpand,
  boundChips,
  onBind,
  highlightKey = null,
}: TreeRowProps) {
  const key = pathKey(columnId, segments);
  const isOpen = expanded.has(key);
  const chips = boundChips.get(key) ?? [];
  const isCurrent = highlightKey === key;

  const isArray = Array.isArray(value);
  const expandable = isArray
    ? value.length > 0
    : isPlainObject(value) && Object.keys(value).length > 0;

  const preview = previewOf(value);

  return (
    <>
      {/* Normal tree semantics: clicking a row expands it (leaves bind
          directly — nothing to expand). Binding a non-leaf node is the
          explicit "Use" affordance, so going deeper never accidentally
          selects. */}
      <div
        role="button"
        tabIndex={0}
        className={cn(
          "group/row flex w-full min-w-0 cursor-pointer items-center gap-2 px-2 py-1 text-left text-sm",
          expandable ? "hover:bg-accent/50" : "hover:bg-primary-accent/10",
          isCurrent && "bg-primary-accent/5",
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        title={
          expandable
            ? preview.slice(0, TITLE_PREVIEW_MAX)
            : armedVariable
              ? `Pull {{${armedVariable}}} from here`
              : preview.slice(0, TITLE_PREVIEW_MAX)
        }
        onClick={() => {
          if (expandable) onToggleExpand(key);
          else onBind(columnId, segments);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (expandable) onToggleExpand(key);
            else onBind(columnId, segments);
          }
        }}
      >
        {expandable ? (
          <ChevronDown
            className={cn(
              "text-muted-foreground h-3.5 w-3.5 shrink-0 transition-transform",
              !isOpen && "-rotate-90",
            )}
          />
        ) : (
          <span className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="shrink-0 font-mono font-bold">{label}</span>
        {/* Shape-first: one hard-truncated line of value; the (capped) full
            value lives in the row tooltip. */}
        <span
          className="text-muted-foreground min-w-0 flex-1 truncate text-xs"
          title={preview.slice(0, TITLE_PREVIEW_MAX)}
        >
          {preview}
        </span>
        {partial && (
          <span
            className="text-dark-yellow shrink-0 rounded border px-1 py-px text-[10px]"
            title="Not present in every entry of this list"
          >
            not in every entry
          </span>
        )}
        {/* One slot, two states: the type annotation at rest, a solid "Use"
            while hovering the row — on every row, so whole objects/lists and
            [*] are bindable too (row clicks only expand). */}
        <span
          className={cn(
            "text-muted-foreground shrink-0 rounded border px-1 py-px text-[10px]",
            armedVariable &&
              "group-focus-within/row:hidden group-hover/row:hidden",
          )}
        >
          {badge ?? typeBadge(value)}
        </span>
        {/* The bound node carries a quiet marker (plus the row tint) — a
            solid button here would compete with the real primary actions. */}
        {isCurrent && (
          <span
            className="text-primary-accent bg-primary-accent/10 shrink-0 rounded px-1.5 py-px text-[10px] font-bold"
            title={
              armedVariable
                ? `{{${armedVariable}}} currently pulls from here`
                : "Current mapping"
            }
          >
            current
          </span>
        )}
        {chips.map((variable) => (
          <span
            key={variable}
            className="text-primary-accent bg-primary-accent/10 shrink-0 rounded px-1.5 py-px font-mono text-xs font-bold"
            title={`{{${variable}}} pulls from here`}
          >
            {`{{${variable}}}`}
          </span>
        ))}
        {armedVariable && (
          <button
            type="button"
            className="bg-primary text-primary-foreground hover:bg-primary/90 hidden shrink-0 rounded px-2 py-0.5 text-xs font-bold shadow-sm group-focus-within/row:inline-flex group-hover/row:inline-flex"
            title={`Pull {{${armedVariable}}} from here`}
            onClick={(event) => {
              event.stopPropagation();
              onBind(columnId, segments);
            }}
          >
            Use
          </button>
        )}
      </div>

      {isOpen &&
        expandable &&
        (isArray ? (
          <>
            {/* Every-entry wildcard leads; its children render the
                representative shape across the first entries. */}
            {(() => {
              const rep = wildcardRepresentative(value);
              return (
                <TreeRow
                  columnId={columnId}
                  segments={[...segments, WILDCARD]}
                  label="[*]"
                  value={rep.value}
                  badge="every entry"
                  partialChildKeys={rep.partialKeys}
                  depth={depth + 1}
                  armedVariable={armedVariable}
                  expanded={expanded}
                  onToggleExpand={onToggleExpand}
                  boundChips={boundChips}
                  onBind={onBind}
                  highlightKey={highlightKey}
                />
              );
            })()}
            <TreeRow
              columnId={columnId}
              segments={[...segments, LAST]}
              label="last"
              value={value[value.length - 1]}
              badge="last entry"
              depth={depth + 1}
              armedVariable={armedVariable}
              expanded={expanded}
              onToggleExpand={onToggleExpand}
              boundChips={boundChips}
              onBind={onBind}
              highlightKey={highlightKey}
            />
            {value.slice(0, MAX_CONCRETE_ENTRIES).map((entry, index) => (
              <TreeRow
                key={index}
                columnId={columnId}
                segments={[...segments, index]}
                label={`[${index}]`}
                value={entry}
                depth={depth + 1}
                armedVariable={armedVariable}
                expanded={expanded}
                onToggleExpand={onToggleExpand}
                boundChips={boundChips}
                onBind={onBind}
                highlightKey={highlightKey}
              />
            ))}
            {value.length > MAX_CONCRETE_ENTRIES && (
              <p
                className="text-muted-foreground px-2 py-1 text-xs"
                style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
              >
                {`+${value.length - MAX_CONCRETE_ENTRIES} more entries — [*] covers all of them; use the path editor for a specific one.`}
              </p>
            )}
          </>
        ) : (
          Object.entries(value as Record<string, unknown>).map(
            ([childKey, childValue]) => (
              <TreeRow
                key={childKey}
                columnId={columnId}
                segments={[...segments, childKey]}
                label={childKey}
                value={childValue}
                partial={partialChildKeys?.has(childKey) ?? false}
                depth={depth + 1}
                armedVariable={armedVariable}
                expanded={expanded}
                onToggleExpand={onToggleExpand}
                boundChips={boundChips}
                onBind={onBind}
                highlightKey={highlightKey}
              />
            ),
          )
        ))}
    </>
  );
}

/**
 * Single-variable tree selector for the merged mapping rows: the shape-first
 * sample tree, scoped to one variable — no arming, every row click binds and
 * the caller closes the surface (select semantics). The current binding's
 * path comes pre-expanded so the tree opens "where you are".
 */
// The picker shows no existing mappings — no other-variable chips and no
// "current" marker. It is about picking THIS variable's data; the cards
// above already carry every mapping.
const NO_CHIPS = new Map<string, string[]>();

export function SampleDataTreeSelector({
  variable,
  currentColumnId,
  currentSegments,
  sourceObject,
  onSelect,
}: {
  /** The variable being edited — every click binds it. */
  variable: string;
  currentColumnId: string | null;
  /** Parsed binding segments; null = custom path (no highlight). */
  currentSegments: PathSegment[] | null;
  sourceObject: Record<string, unknown>;
  onSelect: (columnId: string, segments: PathSegment[]) => void;
}) {
  // Open "where you are": the current binding's ancestors start expanded.
  // The selector unmounts on collapse, so this resets per open.
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (currentColumnId && currentSegments) {
      for (let i = 0; i < currentSegments.length; i++) {
        initial.add(pathKey(currentColumnId, currentSegments.slice(0, i)));
      }
    }
    return initial;
  });
  const toggleExpand = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const roots = useMemo(
    () =>
      MAPPABLE_COLUMNS.map((col) => {
        const raw = sourceObject[col.id];
        return {
          columnId: col.id,
          label: col.label,
          value: typeof raw === "string" ? tryParseJson(raw) : raw,
        };
      }),
    [sourceObject],
  );

  return (
    <div className="max-h-80 overflow-y-auto py-1">
      {roots.map((root) => (
        <TreeRow
          key={root.columnId}
          columnId={root.columnId}
          segments={[]}
          label={root.label}
          value={root.value}
          depth={0}
          armedVariable={variable}
          expanded={expanded}
          onToggleExpand={toggleExpand}
          boundChips={NO_CHIPS}
          onBind={onSelect}
        />
      ))}
    </div>
  );
}

/**
 * "Map by pointing": one shape-first tree of the sample observation (roots
 * collapsed, one-line value previews, [*] as a first-class row) shared by
 * all variables. Click a {{variable}} to arm it, then click the node it
 * should pull from; bound variables render as chips on their nodes. The
 * pencil per variable is the advanced escape hatch: a raw JSONPath editor
 * with suggestions (custom paths render on the row, not in the tree).
 */
export function VariableMappingTree({
  overview,
  activeVariable,
  onActiveVariableChange,
  getFieldState,
  onChangeField,
  onDeleteVariable,
  sourceObject,
  hasMatchingObservations,
  sampleLabel,
  onOpenSample,
}: {
  /** Every prompt variable with its mapping label, in prompt order. */
  overview: Array<{ variable: string; label: string; unmapped: boolean }>;
  /** The armed variable (shared with the prompt pills). */
  activeVariable: string | null;
  onActiveVariableChange: (variable: string | null) => void;
  getFieldState: (variable: string) => VariableFieldState;
  onChangeField: (variable: string, next: VariableFieldState) => void;
  onDeleteVariable: (variable: string) => void;
  sourceObject: Record<string, unknown> | null;
  hasMatchingObservations: boolean;
  sampleLabel: string | null;
  onOpenSample: () => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingPathVariable, setEditingPathVariable] = useState<string | null>(
    null,
  );

  const toggleExpand = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Field roots, JSON-decoded so stringified payloads are drillable (same
  // behavior as the extraction and the popover mapper).
  const roots = useMemo(() => {
    if (!sourceObject) return [];
    return MAPPABLE_COLUMNS.map((col) => {
      const raw = sourceObject[col.id];
      return {
        columnId: col.id,
        label: col.label,
        value: typeof raw === "string" ? tryParseJson(raw) : raw,
      };
    });
  }, [sourceObject]);

  // Per-variable binding info: parsed segments (null = custom path the tree
  // can't express) and the resolved value from the sample.
  const bindings = useMemo(
    () =>
      overview.map((item) => {
        const fieldState = getFieldState(item.variable);
        const segments = fieldState.jsonSelector
          ? jsonPathToSegments(fieldState.jsonSelector)
          : [];
        const extracted =
          sourceObject && fieldState.selectedColumnId
            ? extractValueFromObjectAsString(
                sourceObject,
                fieldState.selectedColumnId,
                fieldState.jsonSelector ?? undefined,
              )
            : null;
        return { ...item, fieldState, segments, extracted };
      }),
    [overview, getFieldState, sourceObject],
  );

  // Chips: which variables sit on which tree node.
  const boundChips = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const binding of bindings) {
      if (!binding.fieldState.selectedColumnId || binding.segments === null)
        continue;
      const key = pathKey(
        binding.fieldState.selectedColumnId,
        binding.segments,
      );
      map.set(key, [...(map.get(key) ?? []), binding.variable]);
    }
    return map;
  }, [bindings]);

  // Keep every bound path visible: auto-expand the ancestors of each binding.
  // Additive only, and the same-size bailout returns the previous set, so
  // re-running on every render is free and user collapses are respected.
  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const binding of bindings) {
        const columnId = binding.fieldState.selectedColumnId;
        if (!columnId || binding.segments === null) continue;
        for (let i = 0; i < binding.segments.length; i++) {
          next.add(pathKey(columnId, binding.segments.slice(0, i)));
        }
      }
      return next.size === prev.size ? prev : next;
    });
  }, [bindings]);

  // Esc disarms.
  useEffect(() => {
    if (!activeVariable) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onActiveVariableChange(null);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [activeVariable, onActiveVariableChange]);

  const bind = (columnId: string, segments: PathSegment[]) => {
    if (!activeVariable) return;
    onChangeField(activeVariable, {
      selectedColumnId: columnId,
      jsonSelector: segmentsToJsonPath(segments),
    });
    onActiveVariableChange(null);
  };

  /** Cycle an array segment through every entry, last entry, and first entry. */
  const toggleSegment = (
    variable: string,
    fieldState: VariableFieldState,
    segments: PathSegment[],
    index: number,
  ) => {
    const next = [...segments];
    next[index] =
      next[index] === WILDCARD ? LAST : next[index] === LAST ? 0 : WILDCARD;
    onChangeField(variable, {
      selectedColumnId: fieldState.selectedColumnId,
      jsonSelector: segmentsToJsonPath(next),
    });
  };

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
      {/* Variable rows: arm, binding crumbs (array crumbs toggle selections),
          path editor, delete, resolved value. */}
      <div className="flex flex-col gap-3">
        {bindings.map((binding) => {
          const armed = activeVariable === binding.variable;
          const columnLabel = binding.fieldState.selectedColumnId
            ? (MAPPABLE_COLUMNS.find(
                (col) => col.id === binding.fieldState.selectedColumnId,
              )?.label ?? binding.fieldState.selectedColumnId)
            : null;
          return (
            <div key={binding.variable} className="flex flex-col gap-1">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <button
                  type="button"
                  className={cn(
                    "text-primary-accent shrink-0 rounded px-1.5 py-0.5 font-mono font-bold",
                    armed
                      ? "bg-primary-accent/15 ring-primary-accent ring-2"
                      : "bg-primary-accent/5 hover:bg-primary-accent/10",
                  )}
                  title={
                    armed
                      ? "Armed — click the data below, or press Esc"
                      : `Click, then pick the data {{${binding.variable}}} pulls in`
                  }
                  onClick={() =>
                    onActiveVariableChange(armed ? null : binding.variable)
                  }
                >
                  {`{{${binding.variable}}}`}
                </button>
                <span className="text-muted-foreground shrink-0">
                  pulls from
                </span>
                {!columnLabel ? (
                  <span className="text-dark-yellow flex items-center gap-1.5 font-bold">
                    <TriangleAlert className="h-4 w-4 shrink-0" />
                    nothing yet — click the variable, then a node below
                  </span>
                ) : binding.segments === null ? (
                  <span
                    className="bg-muted/50 min-w-0 truncate rounded px-1.5 py-0.5 font-mono text-xs"
                    title={`${columnLabel}: ${binding.fieldState.jsonSelector ?? ""} — custom path, not shown in the tree`}
                  >
                    {columnLabel}: {binding.fieldState.jsonSelector}
                  </span>
                ) : (
                  <span className="flex min-w-0 flex-wrap items-center gap-1">
                    <span className="font-bold">{columnLabel}</span>
                    {binding.segments.map((segment, index) => {
                      const isArraySegment =
                        segment === WILDCARD ||
                        segment === LAST ||
                        typeof segment === "number";
                      return (
                        <span key={index} className="flex items-center gap-1">
                          <ChevronRight className="text-muted-foreground h-3 w-3 shrink-0" />
                          {isArraySegment ? (
                            <button
                              type="button"
                              className="hover:bg-accent rounded px-1 font-mono text-xs font-bold underline decoration-dotted underline-offset-2"
                              title={
                                segment === WILDCARD
                                  ? "Every entry — click to switch to the last entry"
                                  : segment === LAST
                                    ? "Last entry — click to switch to the first entry"
                                    : `Entry ${String(segment)} only — click to switch to every entry`
                              }
                              onClick={() =>
                                toggleSegment(
                                  binding.variable,
                                  binding.fieldState,
                                  binding.segments ?? [],
                                  index,
                                )
                              }
                            >
                              {crumbLabel(segment)}
                            </button>
                          ) : (
                            <span
                              className="max-w-40 truncate font-mono text-xs"
                              title={crumbLabel(segment)}
                            >
                              {crumbLabel(segment)}
                            </span>
                          )}
                        </span>
                      );
                    })}
                  </span>
                )}
                <span className="ml-auto flex shrink-0 items-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    title={
                      binding.fieldState.selectedColumnId
                        ? "Edit the JSONPath directly"
                        : "Bind a field first, then refine the path here"
                    }
                    disabled={!binding.fieldState.selectedColumnId}
                    onClick={() =>
                      setEditingPathVariable((prev) =>
                        prev === binding.variable ? null : binding.variable,
                      )
                    }
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="hover:text-destructive"
                    title={`Remove {{${binding.variable}}} from the prompt`}
                    onClick={() => onDeleteVariable(binding.variable)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </span>
              </div>

              {editingPathVariable === binding.variable &&
                binding.fieldState.selectedColumnId && (
                  <div className="rounded-md border">
                    <JsonPathEditor
                      initialPath={binding.fieldState.jsonSelector ?? "$"}
                      suggestions={
                        sourceObject
                          ? buildJsonPathSuggestions(
                              sourceObject[binding.fieldState.selectedColumnId],
                            )
                          : []
                      }
                      onApply={(jsonSelector) => {
                        onChangeField(binding.variable, {
                          selectedColumnId: binding.fieldState.selectedColumnId,
                          jsonSelector,
                        });
                        setEditingPathVariable(null);
                      }}
                      onCancel={() => setEditingPathVariable(null)}
                    />
                  </div>
                )}

              {columnLabel &&
                (binding.extracted?.error ? (
                  <p className="text-dark-yellow flex items-center gap-1.5 text-xs">
                    <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                    {binding.extracted.error.message}
                  </p>
                ) : (
                  <p
                    className={cn(
                      "text-muted-foreground line-clamp-2 text-xs break-words",
                      !binding.extracted?.value && "italic",
                    )}
                    title={
                      binding.extracted?.value?.slice(0, TITLE_PREVIEW_MAX) ??
                      undefined
                    }
                  >
                    {binding.extracted?.value
                      ? binding.extracted.value
                      : sourceObject
                        ? "empty in the sample"
                        : "pick a sample in step 2 to preview the value"}
                  </p>
                ))}
            </div>
          );
        })}
      </div>

      {/* The shared sample tree. */}
      <div className="flex flex-col gap-1">
        <p className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
          {activeVariable ? (
            <span className="text-primary-accent flex items-center gap-1.5 font-bold">
              <MousePointerClick className="h-3.5 w-3.5 shrink-0" />
              {`Click the data {{${activeVariable}}} should pull in — Esc to cancel.`}
            </span>
          ) : sampleLabel ? (
            <>
              <span className="shrink-0">Sample:</span>
              <button
                type="button"
                className="hover:text-foreground inline-flex min-w-0 items-center gap-1 font-bold underline-offset-2 hover:underline"
                title="Open the sample trace"
                onClick={onOpenSample}
              >
                <span className="truncate" title={sampleLabel}>
                  {sampleLabel}
                </span>
                <ExternalLink className="h-3 w-3 shrink-0" />
              </button>
              <span
                className="min-w-0 truncate"
                title="Click a variable above, then the data it pulls in."
              >
                — click a variable above, then the data it pulls in.
              </span>
            </>
          ) : (
            <span>No sample yet — pick a row in step 2.</span>
          )}
        </p>
        {!sourceObject ? (
          <div className="text-muted-foreground rounded-md border border-dashed p-4 text-center text-sm">
            {hasMatchingObservations
              ? "Loading sample data…"
              : "No observations match the current rule — adjust the filters in step 2."}
          </div>
        ) : (
          <div
            className={cn(
              "max-h-[380px] overflow-y-auto rounded-md border py-1",
              activeVariable && "ring-primary-accent/40 ring-2",
            )}
          >
            {roots.map((root) => (
              <TreeRow
                key={root.columnId}
                columnId={root.columnId}
                segments={[]}
                label={root.label}
                value={root.value}
                depth={0}
                armedVariable={activeVariable}
                expanded={expanded}
                onToggleExpand={toggleExpand}
                boundChips={boundChips}
                onBind={bind}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
