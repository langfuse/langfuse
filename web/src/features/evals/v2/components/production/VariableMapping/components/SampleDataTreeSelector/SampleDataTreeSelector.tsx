import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";

import { tryParseJson } from "@/src/features/evals/v2/lib/jsonPathSuggestions";
import {
  LAST,
  WILDCARD,
  type PathSegment,
} from "@/src/features/evals/v2/lib/jsonPathSegments";
import { cn } from "@/src/utils/tailwind";

const MAX_CONCRETE_ENTRIES = 5;
const WILDCARD_SHAPE_SAMPLE = 10;
const TITLE_PREVIEW_MAX = 700;

function pathKey(columnId: string, segments: PathSegment[]): string {
  if (segments.includes(LAST)) {
    return pathKey(
      columnId,
      segments.map((segment) => (segment === LAST ? "\u0000last" : segment)),
    );
  }

  return [
    columnId,
    ...segments.map((segment) =>
      segment === WILDCARD
        ? "\0*"
        : typeof segment === "number"
          ? `\0${segment}`
          : segment,
    ),
  ].join("\x01");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function wildcardRepresentative(entries: unknown[]) {
  const objects = entries.slice(0, WILDCARD_SHAPE_SAMPLE).filter(isPlainObject);
  if (objects.length === 0) {
    return { value: entries[0], partialKeys: new Set<string>() };
  }

  const value: Record<string, unknown> = {};
  const counts = new Map<string, number>();
  for (const entry of objects) {
    for (const [key, childValue] of Object.entries(entry)) {
      if (!(key in value)) value[key] = childValue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return {
    value,
    partialKeys: new Set(
      Array.from(counts.entries())
        .filter(([, count]) => count < objects.length)
        .map(([key]) => key),
    ),
  };
}

function previewOf(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value) ?? String(value);
}

function typeBadge(value: unknown): string {
  if (Array.isArray(value)) return `list · ${value.length}`;
  if (value === null) return "null";
  if (typeof value === "object") return `object · ${Object.keys(value).length}`;
  if (typeof value === "string") return "text";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "bool";
  return typeof value;
}

function TreeRow({
  variable,
  columnId,
  segments,
  label,
  value,
  badge,
  depth,
  partial = false,
  partialChildKeys,
  expanded,
  onToggleExpand,
  onSelect,
  currentKey,
}: {
  variable: string;
  columnId: string;
  segments: PathSegment[];
  label: string;
  value: unknown;
  badge?: string;
  depth: number;
  partial?: boolean;
  partialChildKeys?: Set<string>;
  expanded: Set<string>;
  onToggleExpand: (key: string) => void;
  onSelect: (columnId: string, segments: PathSegment[]) => void;
  currentKey: string | null;
}) {
  const key = pathKey(columnId, segments);
  const isOpen = expanded.has(key);
  const isCurrent = currentKey === key;
  const isArray = Array.isArray(value);
  const expandable = isArray
    ? value.length > 0
    : isPlainObject(value) && Object.keys(value).length > 0;
  const preview = previewOf(value);

  const selectOrToggle = () => {
    if (expandable) onToggleExpand(key);
    else onSelect(columnId, segments);
  };

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        className={cn(
          "group/row hover:bg-muted/50 flex w-full min-w-0 cursor-pointer items-center gap-2 px-2 py-1 text-left text-sm",
          isCurrent && "bg-primary-accent/5",
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        title={
          expandable
            ? preview.slice(0, TITLE_PREVIEW_MAX)
            : `Pull {{${variable}}} from here`
        }
        onClick={selectOrToggle}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            selectOrToggle();
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
        <span
          className="text-muted-foreground min-w-0 flex-1 truncate text-xs"
          title={preview.slice(0, TITLE_PREVIEW_MAX)}
        >
          {preview}
        </span>
        {partial ? (
          <span
            className="text-dark-yellow shrink-0 rounded border px-1 py-px text-[10px]"
            title="Not present in every entry of this list"
          >
            not in every entry
          </span>
        ) : null}
        <span className="text-muted-foreground shrink-0 rounded border px-1 py-px text-[10px] group-focus-within/row:hidden group-hover/row:hidden">
          {badge ?? typeBadge(value)}
        </span>
        {isCurrent ? (
          <span
            className="text-primary-accent bg-primary-accent/10 shrink-0 rounded border border-transparent px-1.5 py-px text-[10px] font-bold"
            title={`{{${variable}}} currently pulls from here`}
          >
            current
          </span>
        ) : null}
        <button
          type="button"
          className="bg-primary text-primary-foreground hover:bg-primary/90 hidden shrink-0 rounded px-2 py-0.5 text-xs font-bold shadow-sm group-focus-within/row:inline-flex group-hover/row:inline-flex"
          title={`Pull {{${variable}}} from here`}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(columnId, segments);
          }}
        >
          Use
        </button>
      </div>

      {isOpen && expandable
        ? isArray
          ? (() => {
              const representative = wildcardRepresentative(value);
              return (
                <>
                  <TreeRow
                    variable={variable}
                    columnId={columnId}
                    segments={[...segments, WILDCARD]}
                    label="[*]"
                    value={representative.value}
                    badge="every entry"
                    partialChildKeys={representative.partialKeys}
                    depth={depth + 1}
                    expanded={expanded}
                    onToggleExpand={onToggleExpand}
                    onSelect={onSelect}
                    currentKey={currentKey}
                  />
                  <TreeRow
                    variable={variable}
                    columnId={columnId}
                    segments={[...segments, LAST]}
                    label="last"
                    value={value[value.length - 1]}
                    badge="last entry"
                    depth={depth + 1}
                    expanded={expanded}
                    onToggleExpand={onToggleExpand}
                    onSelect={onSelect}
                    currentKey={currentKey}
                  />
                  {value.slice(0, MAX_CONCRETE_ENTRIES).map((entry, index) => (
                    <TreeRow
                      key={index}
                      variable={variable}
                      columnId={columnId}
                      segments={[...segments, index]}
                      label={`[${index}]`}
                      value={entry}
                      depth={depth + 1}
                      expanded={expanded}
                      onToggleExpand={onToggleExpand}
                      onSelect={onSelect}
                      currentKey={currentKey}
                    />
                  ))}
                  {value.length > MAX_CONCRETE_ENTRIES ? (
                    <p
                      className="text-muted-foreground px-2 py-1 text-xs"
                      style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
                    >
                      {`+${value.length - MAX_CONCRETE_ENTRIES} more entries — [*] covers all of them; use the path editor for a specific one.`}
                    </p>
                  ) : null}
                </>
              );
            })()
          : Object.entries(value as Record<string, unknown>).map(
              ([childKey, childValue]) => (
                <TreeRow
                  key={childKey}
                  variable={variable}
                  columnId={columnId}
                  segments={[...segments, childKey]}
                  label={childKey}
                  value={childValue}
                  partial={partialChildKeys?.has(childKey) ?? false}
                  depth={depth + 1}
                  expanded={expanded}
                  onToggleExpand={onToggleExpand}
                  onSelect={onSelect}
                  currentKey={currentKey}
                />
              ),
            )
        : null}
    </>
  );
}

/** Selects one sample-observation field or nested path for a prompt variable. */
export function SampleDataTreeSelector({
  variable,
  roots,
  currentColumnId,
  currentSegments,
  onSelect,
}: {
  variable: string;
  roots: Array<{ id: string; label: string; value: unknown }>;
  currentColumnId: string | null;
  currentSegments: PathSegment[] | null;
  onSelect: (columnId: string, segments: PathSegment[]) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (currentColumnId && currentSegments) {
      for (let index = 0; index < currentSegments.length; index++) {
        initial.add(pathKey(currentColumnId, currentSegments.slice(0, index)));
      }
    }
    return initial;
  });
  const parsedRoots = useMemo(
    () =>
      roots.map((root) => ({
        ...root,
        value:
          typeof root.value === "string"
            ? tryParseJson(root.value)
            : root.value,
      })),
    [roots],
  );
  const currentKey =
    currentColumnId && currentSegments
      ? pathKey(currentColumnId, currentSegments)
      : null;

  return (
    <div className="max-h-80 overflow-y-auto py-1">
      {parsedRoots.map((root) => (
        <TreeRow
          key={root.id}
          variable={variable}
          columnId={root.id}
          segments={[]}
          label={root.label}
          value={root.value}
          depth={0}
          expanded={expanded}
          onToggleExpand={(key) =>
            setExpanded((current) => {
              const next = new Set(current);
              if (next.has(key)) next.delete(key);
              else next.add(key);
              return next;
            })
          }
          onSelect={onSelect}
          currentKey={currentKey}
        />
      ))}
    </div>
  );
}
