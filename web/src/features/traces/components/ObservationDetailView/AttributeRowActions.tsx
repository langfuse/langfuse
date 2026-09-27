/** Row menu for the Attributes table: copy, then include / exclude via the
 * attribute's own table column. */

import { useRouter } from "next/router";
import { Copy, Filter, FilterX } from "lucide-react";
import { type Row } from "@tanstack/react-table";
import { type FilterState } from "@langfuse/shared";

import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/src/components/ui/dropdown-menu";
import { getCopyValue } from "@/src/components/table/ValueCell";
import { type JsonTableRow } from "@/src/components/table/utils/jsonExpansionUtils";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import { buildEventsTablePathForColumnFilter } from "@/src/features/events";
import { attributeColumnFilter } from "@/src/features/traces/fns/attributeColumnFilter";
import { attributeGrammar } from "@/src/features/traces/fns/attributeGrammar";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";

export type AttributeTableAction = "copy" | "include_filter" | "exclude_filter";

export function AttributeRowActions({
  row,
  projectId,
  filterTarget,
  anchorTime,
  analyticsTable,
}: {
  row: Row<JsonTableRow>;
  projectId: string;
  filterTarget: "observations" | "traces";
  /** Keeps the target table's window covering the source row. */
  anchorTime?: Date | null;
  analyticsTable: "attributes" | "metadata";
}) {
  const router = useRouter();
  const capture = usePostHogClientCapture();
  const { key, value, hasChildren } = row.original;
  const valueText = String(value);
  const filter =
    hasChildren || key == null
      ? null
      : attributeColumnFilter(key, valueText, filterTarget);
  const includeText = filter ? attributeGrammar(key ?? "", valueText) : null;
  const excludeClause = filter?.exclude;

  const track = (action: AttributeTableAction) =>
    capture("trace_detail:attribute_table_action", {
      table: analyticsTable,
      action,
    });

  const navigate = (
    clause: FilterState[number],
    target: "observations" | "traces",
  ) =>
    router.push(
      buildEventsTablePathForColumnFilter({
        currentPath: router.asPath,
        projectId,
        target,
        filter: clause,
        coverTime: anchorTime ?? undefined,
      }),
    );

  return (
    <>
      <DropdownMenuItem
        className="text-xs"
        onSelect={() => {
          track("copy");
          copyTextToClipboard(getCopyValue(value));
        }}
      >
        <Copy className="mr-2 h-3.5 w-3.5 shrink-0" />
        {hasChildren ? "Copy structure" : "Copy value"}
      </DropdownMenuItem>
      {filter && includeText ? (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-xs"
            onSelect={() => {
              track("include_filter");
              navigate(filter.include, filter.target);
            }}
          >
            <Filter className="mr-2 h-3.5 w-3.5 shrink-0" />
            <span className="flex min-w-0 flex-col">
              <span>Include in filter</span>
              <span
                className="text-muted-foreground truncate font-mono"
                title={includeText}
              >
                {includeText}
              </span>
            </span>
          </DropdownMenuItem>
          {excludeClause ? (
            <DropdownMenuItem
              className="text-xs"
              onSelect={() => {
                track("exclude_filter");
                navigate(excludeClause, filter.target);
              }}
            >
              <FilterX className="mr-2 h-3.5 w-3.5 shrink-0" />
              <span className="flex min-w-0 flex-col">
                <span>Exclude from filter</span>
                <span
                  className="text-muted-foreground truncate font-mono"
                  title={`-${includeText}`}
                >
                  -{includeText}
                </span>
              </span>
            </DropdownMenuItem>
          ) : null}
        </>
      ) : null}
    </>
  );
}
