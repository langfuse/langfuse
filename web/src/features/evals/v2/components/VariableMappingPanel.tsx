import { useMemo, useState } from "react";
import {
  Check,
  ChevronRight,
  MousePointerClick,
  Pencil,
  Play,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";

import { Button } from "@/src/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/src/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import {
  MAPPABLE_COLUMNS,
  type VariableFieldState,
} from "@/src/features/evals/v2/components/VariableMappingPopover";
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
import { resolveShapeNode } from "@/src/features/evals/v2/lib/resolveShapeNode";
import { cn } from "@/src/utils/tailwind";
import { extractValueFromObjectAsString } from "@langfuse/shared";

// Breadcrumb rows never wrap: beyond this many crumbs the middle collapses
// into a "…" (root field + the last crumbs stay visible).
const MAX_VISIBLE_CRUMBS = 2;

export function previewOf(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value) ?? String(value);
}

/** Compact type/size hint shown on drill rows ("object · 4", "text", …). */
export function typeBadge(value: unknown): string {
  if (Array.isArray(value)) return `list · ${value.length}`;
  if (value === null) return "null";
  if (typeof value === "object") return `object · ${Object.keys(value).length}`;
  if (typeof value === "string") return "text";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "bool";
  return typeof value;
}

function Callout({
  icon,
  children,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm">
      {icon}
      <p className="max-w-xs">{children}</p>
    </div>
  );
}

/** One clickable drill-down row: key/index, value preview, type, chevron. */
function DrillRow({
  label,
  value,
  badge,
  onClick,
}: {
  label: string;
  value?: unknown;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="hover:bg-accent/50 flex w-full min-w-0 items-center gap-2 px-2 py-1.5 text-left text-sm"
      onClick={onClick}
    >
      <span className="shrink-0 font-mono font-bold">{label}</span>
      <span
        className="text-muted-foreground min-w-0 flex-1 truncate text-xs"
        title={value !== undefined ? previewOf(value) : undefined}
      >
        {value !== undefined ? previewOf(value) : ""}
      </span>
      <span className="text-muted-foreground shrink-0 rounded border px-1 py-px text-[10px]">
        {badge ?? typeBadge(value)}
      </span>
      <ChevronRight className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
    </button>
  );
}

/** Inline JSONPath editor with suggestions from the sample (edit mode).
    Shared with the tree mapper (VariableMappingTree). */
export function JsonPathEditor({
  initialPath,
  suggestions,
  onApply,
  onCancel,
}: {
  initialPath: string;
  suggestions: string[];
  onApply: (jsonSelector: string | null) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState(initialPath);

  const trimmed = query.trim();
  const filtered = useMemo(() => {
    if (!trimmed || trimmed === "$") return suggestions;
    const lower = trimmed.toLowerCase();
    return suggestions.filter((p) => p.toLowerCase().includes(lower));
  }, [suggestions, trimmed]);

  // "$" / empty mean "full value" — stored as no selector.
  const apply = (path: string) => {
    const normalized = path.trim();
    onApply(normalized && normalized !== "$" ? normalized : null);
  };

  return (
    <Command shouldFilter={false} className="bg-transparent">
      <div className="flex items-center gap-1 border-b pr-1">
        <div className="min-w-0 flex-1">
          <CommandInput
            autoFocus
            showBorder={false}
            className="font-mono text-sm"
            placeholder="$.messages[*].content"
            value={query}
            onValueChange={setQuery}
            onKeyDown={(event) => {
              if (event.key === "Escape") onCancel();
            }}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          title="Apply JSONPath"
          onClick={() => apply(query)}
        >
          <Check className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          title="Cancel"
          onClick={onCancel}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <CommandList>
        <CommandItem value="__full__" onSelect={() => apply("$")}>
          Full value (no path)
        </CommandItem>
        {trimmed.length > 0 &&
          trimmed !== "$" &&
          !suggestions.includes(trimmed) && (
            <CommandItem
              value={trimmed}
              className="font-mono text-xs"
              onSelect={() => apply(trimmed)}
            >
              {`Use "${trimmed}"`}
            </CommandItem>
          )}
        {filtered.length > 0 && (
          <CommandGroup heading="From sample observation">
            {filtered.slice(0, 50).map((path) => (
              <CommandItem
                key={path}
                value={path}
                className="font-mono text-xs"
                onSelect={() => apply(path)}
              >
                <span className="truncate" title={path}>
                  {path}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  );
}

/**
 * The mapping side of the split prompt section: activated by clicking a
 * {{variable}} pill in the prompt, it maps that variable by drilling into
 * the sample observation. The breadcrumb is the mapping — the field dropdown
 * is its root crumb, each drill click appends a crumb, and the trail doubles
 * as the stored JSONPath (editable directly via the pencil, with suggestions
 * from the sample).
 */
export function VariableMappingPanel({
  activeVariable,
  fieldState,
  overview,
  onSelectVariable,
  sourceObject,
  hasMatchingObservations,
  onChange,
  onDelete,
  testAction,
  className,
}: {
  activeVariable: string | null;
  /** Mapping of the active variable; null while no variable is active. */
  fieldState: VariableFieldState | null;
  /** Idle-state overview: every prompt variable with its mapping label,
      unmapped ones first. */
  overview: Array<{ variable: string; label: string; unmapped: boolean }>;
  onSelectVariable: (variable: string) => void;
  /** The sample observation every variable maps against. */
  sourceObject: Record<string, unknown> | null;
  /** False when the current rule matches nothing — drives the empty state. */
  hasMatchingObservations: boolean;
  onChange: (next: VariableFieldState) => void;
  /** Removes the active variable from the prompt. */
  onDelete?: () => void;
  /** Readiness hub: run-test CTA in the idle state ("all mapped → test"),
      plus a reopen row for the last result. */
  testAction?: {
    run: () => void;
    isPending: boolean;
    disabledReason: string | null;
    lastResultLabel: string | null;
    onOpenLastResult: () => void;
  };
  className?: string;
}) {
  const [editingPath, setEditingPath] = useState(false);

  const segments = useMemo(
    () =>
      fieldState?.jsonSelector
        ? jsonPathToSegments(fieldState.jsonSelector)
        : [],
    [fieldState?.jsonSelector],
  );

  // The sample field's value, JSON-decoded so objects are drillable even when
  // the column is stored as an encoded string (mirrors extraction behavior).
  const fieldRoot = useMemo(() => {
    if (!sourceObject || !fieldState?.selectedColumnId) return undefined;
    const raw = sourceObject[fieldState.selectedColumnId];
    return typeof raw === "string" ? tryParseJson(raw) : raw;
  }, [sourceObject, fieldState]);

  const pathSuggestions = useMemo(() => {
    if (!sourceObject || !fieldState?.selectedColumnId) return [];
    return buildJsonPathSuggestions(sourceObject[fieldState.selectedColumnId]);
  }, [sourceObject, fieldState]);

  // The value the mapping actually resolves to — via the real JSONPath
  // extraction, so wildcard paths show the aggregated result.
  const extracted = useMemo(() => {
    if (!sourceObject || !fieldState?.selectedColumnId) return null;
    const { value, error } = extractValueFromObjectAsString(
      sourceObject,
      fieldState.selectedColumnId,
      fieldState.jsonSelector ?? undefined,
    );
    return error ? { error: error.message } : { value };
  }, [sourceObject, fieldState]);

  if (!activeVariable || !fieldState) {
    // Idle: the full mapping manifest — every prompt variable with its
    // current binding (unmapped first), each row opening the mapper.
    const unmapped = overview.filter((item) => item.unmapped);
    return (
      <div
        className={cn("flex min-h-0 flex-col", className)}
        data-variable-mapping-panel=""
      >
        {overview.length === 0 ? (
          <Callout icon={<MousePointerClick className="h-5 w-5" />}>
            {`Add a {{variable}} to the prompt to pull in the data being evaluated.`}
          </Callout>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2">
            <p className="text-muted-foreground px-2 pb-2 text-xs">
              {`Every {{variable}} and the data it pulls from the sample — click one to change its mapping.`}
            </p>
            <div className="divide-y rounded-md border">
              {overview.map((item) => (
                <button
                  key={item.variable}
                  type="button"
                  className="hover:bg-accent/50 flex w-full min-w-0 items-center gap-2 px-2 py-1.5 text-left text-sm"
                  onClick={() => onSelectVariable(item.variable)}
                >
                  <span
                    className="text-primary-accent shrink-0 font-mono font-bold"
                    title={`{{${item.variable}}}`}
                  >
                    {`{{${item.variable}}}`}
                  </span>
                  {item.unmapped ? (
                    <span className="text-dark-yellow flex min-w-0 flex-1 items-center gap-1.5 font-bold">
                      <TriangleAlert className="h-4 w-4 shrink-0" />
                      <span className="truncate" title="not mapped yet">
                        not mapped yet
                      </span>
                    </span>
                  ) : (
                    <span
                      className="text-muted-foreground min-w-0 flex-1 truncate"
                      title={item.label}
                    >
                      {item.label}
                    </span>
                  )}
                  <ChevronRight className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}
        {/* Readiness hub: once every variable is mapped, the panel itself
            hands over the next action. */}
        {testAction && (
          <div className="flex shrink-0 flex-col items-center gap-2 border-t p-3">
            {overview.length > 0 && unmapped.length === 0 && (
              <p className="text-dark-green flex items-center gap-1.5 text-sm font-bold">
                <Check className="h-4 w-4 shrink-0 text-green-600" />
                All variables mapped
              </p>
            )}
            <Button
              type="button"
              variant={
                overview.length > 0 && unmapped.length === 0
                  ? "default"
                  : "outline"
              }
              size="sm"
              loading={testAction.isPending}
              disabled={Boolean(testAction.disabledReason)}
              title={
                testAction.disabledReason ??
                "Run the evaluator on the selected sample"
              }
              onClick={testAction.run}
            >
              <Play className="mr-1.5 h-3.5 w-3.5" />
              Test with sample
            </Button>
            {testAction.lastResultLabel && (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground text-xs hover:underline"
                onClick={testAction.onOpenLastResult}
              >
                {`${testAction.lastResultLabel} ›`}
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  const setPath = (nextSegments: PathSegment[]) => {
    onChange({ ...fieldState, jsonSelector: segmentsToJsonPath(nextSegments) });
  };

  const applyEditedPath = (jsonSelector: string | null) => {
    onChange({ ...fieldState, jsonSelector });
    setEditingPath(false);
  };

  const hasWildcard = segments?.includes(WILDCARD) ?? false;
  const shape =
    segments !== null && fieldRoot !== undefined
      ? resolveShapeNode(fieldRoot, segments)
      : null;

  const columnLabel =
    MAPPABLE_COLUMNS.find((col) => col.id === fieldState.selectedColumnId)
      ?.label ?? fieldState.selectedColumnId;
  // Up-navigation as a quiet text link folded into the caption line under
  // the drill content — visible on every level below the field root.
  const backLink =
    segments !== null && segments.length > 0 ? (
      <button
        type="button"
        className="hover:text-foreground mr-2 font-bold underline-offset-2 hover:underline"
        title={`Back to ${
          segments.length >= 2
            ? crumbLabel(segments[segments.length - 2])
            : (columnLabel ?? "")
        }`}
        onClick={() => setPath(segments.slice(0, -1))}
      >
        ‹ back
      </button>
    ) : null;

  return (
    <div
      className={cn("flex min-h-0 flex-col", className)}
      data-variable-mapping-panel=""
    >
      {/* Header, one wrapping line: "{{var}} pulls from" and the breadcrumb
          share the line and only break when it gets too long (middle crumbs
          still collapse into "…"); the actions stay pinned top-right. The
          trail IS the stored JSONPath. */}
      <div className="border-b p-2">
        <div className="flex items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className="text-primary-accent shrink-0 font-mono text-sm font-bold"
              title={`{{${activeVariable}}}`}
            >
              {`{{${activeVariable}}}`}
            </span>
            <span className="text-muted-foreground shrink-0 text-sm">
              pulls from
            </span>
            {/* Breadcrumb — only once a field is mapped; unmapped variables
                pick their field from drill rows in the body instead. */}
            {fieldState.selectedColumnId && (
              <span className="flex min-w-0 items-center gap-1">
                <Select
                  value={fieldState.selectedColumnId ?? undefined}
                  onValueChange={(value) =>
                    // A new field invalidates the old drill path.
                    onChange({ selectedColumnId: value, jsonSelector: null })
                  }
                >
                  <SelectTrigger
                    className={cn(
                      "hover:bg-accent/50 h-7 w-auto shrink-0 gap-1 border-none bg-transparent px-2 font-bold shadow-none",
                      segments !== null &&
                        segments.length === 0 &&
                        "bg-accent/60",
                    )}
                  >
                    <SelectValue placeholder="select field…" />
                  </SelectTrigger>
                  <SelectContent>
                    {MAPPABLE_COLUMNS.map((col) => (
                      <SelectItem key={col.id} value={col.id}>
                        {col.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {segments !== null && segments.length > MAX_VISIBLE_CRUMBS && (
                  <span className="flex shrink-0 items-center gap-1">
                    <ChevronRight className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                    <span
                      className="text-muted-foreground px-1 text-sm"
                      title={fieldState.jsonSelector ?? undefined}
                    >
                      …
                    </span>
                  </span>
                )}
                {(segments ?? []).map((segment, index, all) => {
                  if (
                    all.length > MAX_VISIBLE_CRUMBS &&
                    index < all.length - MAX_VISIBLE_CRUMBS
                  ) {
                    return null;
                  }
                  return (
                    <span
                      key={index}
                      className="flex min-w-0 items-center gap-1"
                    >
                      <ChevronRight className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                      <button
                        type="button"
                        className={cn(
                          "hover:bg-accent/50 max-w-48 truncate rounded-md px-2 py-1 font-mono text-sm",
                          index === all.length - 1 && "bg-accent/60 font-bold",
                        )}
                        title={crumbLabel(segment)}
                        onClick={() => setPath(all.slice(0, index + 1))}
                      >
                        {crumbLabel(segment)}
                      </button>
                    </span>
                  );
                })}
              </span>
            )}
          </div>
          <span className="flex shrink-0 items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              title={
                fieldState.selectedColumnId
                  ? "Edit JSONPath directly"
                  : "Pick a field first."
              }
              disabled={!fieldState.selectedColumnId}
              onClick={() => setEditingPath((prev) => !prev)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            {onDelete && (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="hover:text-destructive"
                title={`Remove {{${activeVariable}}} from the prompt`}
                onClick={onDelete}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </span>
        </div>
      </div>

      {!fieldState.selectedColumnId ? (
        // Unmapped: pick the field the same way deeper levels are picked —
        // as drill rows over the sample data.
        !sourceObject ? (
          <Callout>
            {hasMatchingObservations
              ? "Loading sample data…"
              : "No observations match the current rule — adjust the filters in the right pane to preview and drill into sample data."}
          </Callout>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2">
            <p className="text-muted-foreground px-2 pb-2 text-xs">
              {`{{${activeVariable}}} isn't mapped yet — choose where it pulls its data from.`}
            </p>
            <div className="divide-y rounded-md border">
              {MAPPABLE_COLUMNS.map((col) => {
                const raw = sourceObject[col.id];
                return (
                  <DrillRow
                    key={col.id}
                    label={col.label}
                    value={typeof raw === "string" ? tryParseJson(raw) : raw}
                    onClick={() =>
                      onChange({ selectedColumnId: col.id, jsonSelector: null })
                    }
                  />
                );
              })}
            </div>
          </div>
        )
      ) : editingPath ? (
        <JsonPathEditor
          initialPath={fieldState.jsonSelector ?? "$"}
          suggestions={pathSuggestions}
          onApply={applyEditedPath}
          onCancel={() => setEditingPath(false)}
        />
      ) : !sourceObject ? (
        <Callout>
          {hasMatchingObservations
            ? "Loading sample data…"
            : "No observations match the current rule — adjust the filters in the right pane to preview and drill into sample data."}
        </Callout>
      ) : segments === null ? (
        // A path the drill-down can't express (filter, slice, …).
        <div className="flex flex-col gap-2 p-3">
          <p className="text-muted-foreground text-xs">
            This variable uses a custom JSONPath the drill-down can’t navigate:
          </p>
          <code className="bg-muted/50 rounded-md p-2 font-mono text-xs break-all">
            {fieldState.jsonSelector}
          </code>
          {extracted && (
            <pre className="bg-muted/50 max-h-40 overflow-y-auto rounded-md p-2 font-mono text-xs break-all whitespace-pre-wrap">
              {extracted.error ?? (extracted.value || "empty")}
            </pre>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => setPath([])}
          >
            Clear path and drill down instead
          </Button>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2">
          {fieldRoot === undefined || !shape?.found ? (
            <Callout>
              Nothing at this path in the sample — go back or switch the field.
              {backLink && <span className="block pt-2">{backLink}</span>}
            </Callout>
          ) : Array.isArray(shape.value) ? (
            <>
              <p className="text-muted-foreground px-2 pb-2 text-xs">
                {backLink}
                {`{{${activeVariable}}} pulls in this whole list — choose an entry, [*] for every entry, or last for the final entry.`}
              </p>
              <div className="divide-y rounded-md border">
                {shape.value.length > 0 && (
                  <>
                    <DrillRow
                      label="[*]"
                      badge="every entry"
                      onClick={() => setPath([...segments, WILDCARD])}
                    />
                    <DrillRow
                      label="last"
                      badge="last entry"
                      value={shape.value[shape.value.length - 1]}
                      onClick={() => setPath([...segments, LAST])}
                    />
                  </>
                )}
                {shape.value.slice(0, 50).map((item, index) => (
                  <DrillRow
                    key={index}
                    label={`[${index}]`}
                    value={item}
                    onClick={() => setPath([...segments, index])}
                  />
                ))}
              </div>
              {shape.value.length > 50 && (
                <p className="text-muted-foreground px-2 py-1 text-xs">
                  +{shape.value.length - 50} more entries
                </p>
              )}
            </>
          ) : shape.value !== null && typeof shape.value === "object" ? (
            <>
              <p className="text-muted-foreground px-2 pb-2 text-xs">
                {backLink}
                {hasWildcard
                  ? `Showing the shape of the first entry — the mapping applies to every entry.`
                  : `{{${activeVariable}}} pulls in this whole object — click a property to narrow it.`}
              </p>
              <div className="divide-y rounded-md border">
                {Object.entries(shape.value).map(([key, value]) => (
                  <DrillRow
                    key={key}
                    label={key}
                    value={value}
                    onClick={() => setPath([...segments, key])}
                  />
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="text-muted-foreground px-2 pb-2 text-xs">
                {backLink}
                {hasWildcard
                  ? `{{${activeVariable}}} pulls in this value from every entry:`
                  : `{{${activeVariable}}} pulls in this value:`}
              </p>
              <pre className="bg-muted/50 rounded-md p-2 font-mono text-xs break-all whitespace-pre-wrap">
                {extracted?.error ??
                  (extracted?.value || (
                    <span className="text-muted-foreground">empty</span>
                  ))}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}
