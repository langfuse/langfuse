import Router, { type NextRouter } from "next/router";
import { type Row } from "@tanstack/react-table";
import { Copy, Filter, FilterX } from "@langfuse/icons";
import { type ComponentProps } from "react";
import { type JsonTableRow } from "@/src/components/table/utils/jsonExpansionUtils";
import { getCopyValue } from "@/src/components/table/ValueCell";
import { type DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import {
  buildEventsTablePathForMetadataFilter,
  type MetadataFilterOperator,
} from "@/src/features/events";

/** Walks up to the top-level (level 0) ancestor key for a metadata row. */
function resolveTopLevelMetadataKey(row: Row<JsonTableRow>): string {
  let cursor: Row<JsonTableRow> | undefined = row;
  while (cursor && cursor.original.level > 0) {
    cursor = cursor.getParentRow() ?? undefined;
  }
  return cursor?.original.key ?? row.original.key;
}

/** Uses actual keys rather than hyphen-joined row IDs, preserving keys like x-request-id. */
function resolveKeyPath(row: Row<JsonTableRow>): string {
  const keys: string[] = [];
  let cursor: Row<JsonTableRow> | undefined = row;
  while (cursor) {
    keys.unshift(String(cursor.original.key));
    cursor = cursor.getParentRow() ?? undefined;
  }
  return keys.join(".");
}

export function getMetadataRowActions({
  row,
  projectId,
  filterTarget,
  router,
}: {
  row: Row<JsonTableRow>;
  projectId: string;
  filterTarget: "observations" | "traces";
  router: Pick<NextRouter, "asPath" | "push">;
}) {
  const { value, type, hasChildren, level } = row.original;

  const isScalar =
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean";
  const filterValue = isScalar ? String(value) : "";
  // Nested values are matched against their JSON-encoded top-level branch.
  // Hide shortcuts when escaping would make the displayed value fail to match.
  // Top-level scalars are usually stored raw, including literal newlines.
  const valueMatchesStoredForm =
    level === 0 || JSON.stringify(filterValue).slice(1, -1) === filterValue;
  const isScalarLeaf =
    isScalar &&
    !hasChildren &&
    (type === "string" || type === "number" || type === "boolean") &&
    // contains "" matches every row, including missing keys; its inverse matches none.
    filterValue.length > 0 &&
    valueMatchesStoredForm;

  // Metadata is a flat Map(String, String), so nested values match a substring
  // of their top-level branch. These operators keep Include and Exclude complements.
  const metadataKey = resolveTopLevelMetadataKey(row);
  const includeOperator: MetadataFilterOperator = "contains";
  const excludeOperator: MetadataFilterOperator = "does not contain";
  const displayValue = type === "string" ? `"${filterValue}"` : filterValue;

  const handleCopyData = () => {
    copyTextToClipboard(getCopyValue(value));
  };
  const handleCopyPath = () => {
    copyTextToClipboard(resolveKeyPath(row));
  };
  const navigateWithFilter = (operator: MetadataFilterOperator) => {
    router.push(
      buildEventsTablePathForMetadataFilter({
        currentPath: Router.asPath,
        projectId,
        metadataKey,
        value: filterValue,
        operator,
        target: filterTarget,
      }),
    );
  };

  const includeFilterText = `metadata.${metadataKey} ${includeOperator} ${displayValue}`;
  const excludeFilterText = `metadata.${metadataKey} ${excludeOperator} ${displayValue}`;

  const items: ComponentProps<typeof DropdownMenu>["items"] = [
    {
      type: "item",
      id: "copy-value",
      title: hasChildren ? "Copy structure" : "Copy value",
      icon: Copy,
      onClick: handleCopyData,
    },
    {
      type: "item",
      id: "copy-path",
      title: "Copy path",
      icon: Copy,
      onClick: handleCopyPath,
    },
  ];

  if (isScalarLeaf) {
    items.push(
      { type: "separator", id: "filter-separator" },
      {
        type: "item",
        id: "include-filter",
        title: "Include in filter",
        tooltip: includeFilterText,
        icon: Filter,
        onClick: () => navigateWithFilter(includeOperator),
      },
      {
        type: "item",
        id: "exclude-filter",
        title: "Exclude from filter",
        tooltip: excludeFilterText,
        icon: FilterX,
        onClick: () => navigateWithFilter(excludeOperator),
      },
    );
  }

  return items;
}
