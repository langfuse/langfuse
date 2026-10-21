/** Row menu for the Attributes table: copy, then include / exclude via the
 * attribute's own table column. */

import Router, { type NextRouter } from "next/router";
import { type ComponentProps } from "react";
import { Copy, Filter, FilterX } from "@langfuse/icons";
import { type Row } from "@tanstack/react-table";
import { type FilterState } from "@langfuse/shared";

import { getCopyValue } from "@/src/components/table/ValueCell";
import { type DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { type JsonTableRow } from "@/src/components/table/utils/jsonExpansionUtils";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import { buildEventsTablePathForColumnFilter } from "@/src/features/events";
import { attributeColumnFilter } from "@/src/features/traces/fns/attributeColumnFilter";
import { attributeGrammar } from "@/src/features/traces/fns/attributeGrammar";
import { type usePostHogClientCapture } from "@/src/features/posthog-analytics";

export function getAttributeRowActions({
  row,
  projectId,
  filterTarget,
  anchorTime,
  analyticsTable,
  router,
  capture,
}: {
  row: Row<JsonTableRow>;
  projectId: string;
  filterTarget: "observations" | "traces";
  /** Keeps the target table's window covering the source row. */
  anchorTime?: Date | null;
  analyticsTable: "attributes" | "metadata";
  router: Pick<NextRouter, "asPath" | "push">;
  capture: ReturnType<typeof usePostHogClientCapture>;
}) {
  const { key, value, hasChildren } = row.original;
  const isScalar =
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean";
  const valueText = isScalar ? String(value) : "";
  const filter =
    !isScalar || hasChildren || key == null
      ? null
      : attributeColumnFilter(key, valueText, filterTarget);
  const includeText = filter ? attributeGrammar(key ?? "", valueText) : null;
  const excludeClause = filter?.exclude;

  const track = (action: "copy" | "include_filter" | "exclude_filter") =>
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
        currentPath: Router.asPath,
        projectId,
        target,
        filter: clause,
        coverTime: anchorTime ?? undefined,
      }),
    );

  const items: ComponentProps<typeof DropdownMenu>["items"] = [
    {
      type: "item",
      id: "copy-value",
      title: hasChildren ? "Copy structure" : "Copy value",
      icon: Copy,
      onClick: () => {
        track("copy");
        copyTextToClipboard(getCopyValue(value));
      },
    },
  ];

  if (filter && includeText) {
    items.push(
      { type: "separator", id: "filter-separator" },
      {
        type: "item",
        id: "include-filter",
        title: "Include in filter",
        tooltip: includeText,
        icon: Filter,
        onClick: () => {
          track("include_filter");
          navigate(filter.include, filter.target);
        },
      },
    );

    if (excludeClause) {
      items.push({
        type: "item",
        id: "exclude-filter",
        title: "Exclude from filter",
        tooltip: `-${includeText}`,
        icon: FilterX,
        onClick: () => {
          track("exclude_filter");
          navigate(excludeClause, filter.target);
        },
      });
    }
  }

  return items;
}
