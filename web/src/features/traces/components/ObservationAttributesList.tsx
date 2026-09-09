/**
 * Light two-column key/value list for an observation's fixed-key attributes
 * (model, environment, release, version, model parameters). Shared by the
 * Preview tab and the Attributes tab so both render the same rows.
 *
 * Attributes are the metadata Langfuse knows about: they have their own
 * columns and can be filtered in the traces / observations tables. Each row
 * therefore carries a hover actions menu with "copy" and, where a table column
 * exists for the key, "filter by this value".
 */

import { useRouter } from "next/router";
import { Copy, EllipsisVertical, Filter, FilterX } from "lucide-react";
import { type FilterState, type JsonNested } from "@langfuse/shared";
import { Button } from "@/src/components/ui/button";
import {
  DropdownMenuController,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/src/components/ui/dropdown-menu";
import { type MetadataFilterActions } from "@/src/components/table/ValueCell";
import { buildEventsTablePathForColumnFilter } from "@/src/features/events/lib/eventsTablePaths";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import { cn } from "@/src/utils/tailwind";

export type AttributeRow = { key: string; value: string };

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function modelParameterRows(
  modelParameters: JsonNested | null | undefined,
): AttributeRow[] {
  if (
    !modelParameters ||
    typeof modelParameters !== "object" ||
    Array.isArray(modelParameters)
  ) {
    return [];
  }
  return Object.entries(modelParameters)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => ({ key, value: stringifyValue(value) }));
}

export function buildObservationAttributeRows({
  model,
  environment,
  release,
  version,
  modelParameters,
}: {
  model: string | null;
  environment: string | null;
  release: string | null | undefined;
  version: string | null;
  modelParameters: JsonNested | null | undefined;
}): AttributeRow[] {
  return [
    { key: "model", value: model ?? "" },
    { key: "environment", value: environment ?? "" },
    { key: "release", value: release ?? "" },
    { key: "version", value: version ?? "" },
    ...modelParameterRows(modelParameters),
  ].filter((row) => row.value !== "");
}

export type AttributeActions = MetadataFilterActions & {
  /** Start time of the observation the rows describe; keeps the target
   * table's window covering it. */
  anchorTime?: Date | null;
};

type AttributeFilter = {
  target: "observations" | "traces";
  include: FilterState[number];
  exclude: FilterState[number];
};

/**
 * Maps an attribute to the table column that can filter on it. Model only
 * exists on observations; release only on traces; environment and version on
 * both, so those follow the caller's target. Model parameters have no column.
 */
function attributeFilter(
  row: AttributeRow,
  target: "observations" | "traces",
): AttributeFilter | null {
  const options = (column: string, t: "observations" | "traces") => ({
    target: t,
    include: {
      column,
      type: "stringOptions" as const,
      operator: "any of" as const,
      value: [row.value],
    },
    exclude: {
      column,
      type: "stringOptions" as const,
      operator: "none of" as const,
      value: [row.value],
    },
  });
  const text = (column: string, t: "observations" | "traces") => ({
    target: t,
    include: {
      column,
      type: "string" as const,
      operator: "=" as const,
      value: row.value,
    },
    exclude: {
      column,
      type: "string" as const,
      operator: "does not contain" as const,
      value: row.value,
    },
  });
  switch (row.key) {
    case "environment":
      return options("environment", target);
    case "model":
      return options("model", "observations");
    case "version":
      return text("version", target);
    case "release":
      return text("release", "traces");
    default:
      return null;
  }
}

/** Search-bar grammar for the value: bare when it survives as one token. */
function grammarValue(value: string): string {
  return /[\s:"()]/.test(value) ? JSON.stringify(value) : value;
}

function AttributeRowActions({
  row,
  actions,
}: {
  row: AttributeRow;
  actions: AttributeActions;
}) {
  const router = useRouter();
  const filter = attributeFilter(row, actions.filterTarget);
  const includeText = `${row.key}:${grammarValue(row.value)}`;
  const excludeText = `-${includeText}`;

  const navigate = (
    clause: FilterState[number],
    target: AttributeFilter["target"],
  ) =>
    router.push(
      buildEventsTablePathForColumnFilter({
        currentPath: router.asPath,
        projectId: actions.projectId,
        target,
        filter: clause,
        coverTime: actions.anchorTime ?? undefined,
      }),
    );

  return (
    <DropdownMenuController
      align="end"
      maxWidth="320px"
      renderMenu={() => (
        <>
          <DropdownMenuItem
            className="text-xs"
            onSelect={() => copyTextToClipboard(row.value)}
          >
            <Copy className="mr-2 h-3.5 w-3.5 shrink-0" />
            Copy value
          </DropdownMenuItem>
          {filter ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-xs"
                onSelect={() => navigate(filter.include, filter.target)}
              >
                <Filter className="mr-2 h-3.5 w-3.5 shrink-0" />
                <span className="flex min-w-0 flex-col">
                  <span>Include in filter</span>
                  <span
                    className="text-muted-foreground truncate"
                    title={includeText}
                  >
                    {includeText}
                  </span>
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-xs"
                onSelect={() => navigate(filter.exclude, filter.target)}
              >
                <FilterX className="mr-2 h-3.5 w-3.5 shrink-0" />
                <span className="flex min-w-0 flex-col">
                  <span>Exclude from filter</span>
                  <span
                    className="text-muted-foreground truncate"
                    title={excludeText}
                  >
                    {excludeText}
                  </span>
                </span>
              </DropdownMenuItem>
            </>
          ) : null}
        </>
      )}
    >
      {({ isOpen, Trigger }) => (
        <Trigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Actions for ${row.key}`}
            title="Actions"
            className={cn(
              "h-4 w-4 p-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100",
              isOpen && "opacity-100",
            )}
            onClick={(event) => event.stopPropagation()}
          >
            <EllipsisVertical className="h-3 w-3" />
          </Button>
        </Trigger>
      )}
    </DropdownMenuController>
  );
}

export function ObservationAttributesList({
  rows,
  actions,
}: {
  rows: AttributeRow[];
  /** When set, each row gets a hover menu with copy + filter shortcuts. */
  actions?: AttributeActions;
}) {
  return (
    <section className="flex flex-col">
      <h3 className="text-sm font-bold">Attributes</h3>
      {rows.length > 0 ? (
        <dl className="divide-border/60 mt-1 grid grid-cols-[minmax(10rem,35%)_minmax(0,1fr)_1rem] divide-y text-xs">
          {rows.map((row) => (
            <div
              key={row.key}
              className="group col-span-full grid grid-cols-subgrid items-center gap-x-4 py-2"
            >
              <dt className="text-muted-foreground truncate" title={row.key}>
                {row.key}
              </dt>
              <dd className="text-foreground truncate" title={row.value}>
                {row.value}
              </dd>
              <div className="flex justify-end">
                {actions ? (
                  <AttributeRowActions row={row} actions={actions} />
                ) : null}
              </div>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-muted-foreground mt-1 text-xs italic">
          No attributes on this observation.
        </p>
      )}
    </section>
  );
}
