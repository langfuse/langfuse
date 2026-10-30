/* eslint-disable no-nested-ternary, react/no-unstable-nested-components */
/* eslint-disable @repo/no-style-props */
import { type JsonViewState } from "./JsonViewController";
import React, {
  useMemo,
  useState,
  useEffect,
  useRef,
  useCallback,
  memo,
} from "react";
import { cn } from "@/src/utils/tailwind";

import { Skeleton } from "@/src/components/ui/skeleton";
import { LangfuseMediaView } from "@/src/components/ui/LangfuseMediaView";

import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { Button } from "@/src/components/ui/button";
import { useClickWithoutSelection } from "@/src/hooks/useClickWithoutSelection";
import { ChevronDown, ChevronRight } from "@langfuse/icons";
import {
  useReactTable,
  getCoreRowModel,
  getExpandedRowModel,
  flexRender,
  type ExpandedState,
  type Row,
} from "@tanstack/react-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";

import { MarkdownView } from "@/src/components/ui/MarkdownView";

import {
  convertRowIdToKeyPath,
  transformJsonToTableData,
  type JsonTableRow,
} from "@/src/components/table/utils/jsonExpansionUtils";
import {
  ValueCell,
  getValueStringLength,
} from "@/src/components/table/ValueCell";
import { ItemBadge, type LangfuseItemType } from "@/src/components/ItemBadge";

import { LargeStringFallback } from "@/src/components/ui/LargeStringFallback";

const INDENTATION_PER_LEVEL = 16;
const INDENTATION_BASE = 12;
const KEY_CLASSES = "text-muted-foreground font-mono text-xs/5 wrap-break-word";
const CELL_CLASSES =
  "border-border/60 py-1 pr-2 pl-1 align-top whitespace-normal";

const MAX_CELL_DISPLAY_CHARS = 2000;

const PREVIEW_TEXT_CLASSES = "text-gray-500 dark:text-gray-400";

function getEmptyValueDisplay(value: unknown): string | null {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (value === "") return "empty string";
  if (
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  )
    return "empty object";
  return null;
}

/** Borderless bodies sit inside a section box, which owns fill and inset. */
function getContainerClasses(
  scrollable: boolean | undefined,
  codeClassName: string | undefined,
  baseClasses = "whitespace-pre-wrap wrap-break-word p-3 text-xs",
  borderless = false,
) {
  return cn(
    baseClasses,
    borderless
      ? "rounded-md overflow-clip p-0"
      : scrollable
        ? ""
        : "rounded-sm border",
    codeClassName,
  );
}

function handleRowExpansion(
  row: Row<JsonTableRow>,
  onLazyLoadChildren?: (rowId: string) => void,
  expandedCells?: Set<string>,
  toggleCellExpansion?: (cellId: string) => void,
) {
  // row expansion takes precedence over cell expansion
  if (row.original.hasChildren) {
    const originalRow = row.original;
    if (originalRow.rawChildData && !originalRow.childrenGenerated) {
      onLazyLoadChildren?.(originalRow.id);
    }
    row.toggleExpanded();
    return;
  }

  // does the row have children, then expand row
  const cellId = `${row.id}-value`;
  const { value } = row.original;
  const valueStringLength = getValueStringLength(value);
  const needsCellExpansion = valueStringLength > MAX_CELL_DISPLAY_CHARS;

  if (needsCellExpansion && expandedCells && toggleCellExpansion) {
    toggleCellExpansion(cellId);
  }
}

function generateAllChildrenRecursively(
  row: JsonTableRow,
  onRowGenerated?: (rowId: string) => void,
): void {
  if (row.rawChildData && !row.childrenGenerated) {
    row.subRows = transformJsonToTableData(
      row.rawChildData,
      row.key,
      row.level + 1,
      row.id,
      false,
    );
    row.childrenGenerated = true;
    onRowGenerated?.(row.id);
    row.subRows.forEach((child) => {
      generateAllChildrenRecursively(child, onRowGenerated);
    });
  }
}

interface JsonTableRowProps {
  row: Row<JsonTableRow>;
  rowIndex: number;
  topLevelRowRef?: React.RefObject<HTMLTableRowElement | null>;
  onLazyLoadChildren?: (rowId: string) => void;
  expandedCells: Set<string>;
  toggleCellExpansion: (cellId: string) => void;
  stickyTopLevelKey: boolean;
}

const JsonTableRowComponent = memo(
  ({
    row,
    rowIndex,
    topLevelRowRef,
    onLazyLoadChildren,
    expandedCells,
    toggleCellExpansion,
    stickyTopLevelKey,
  }: JsonTableRowProps) => {
    // Hook is now at top level of this component ✅
    const isExpandable =
      row.original.hasChildren ||
      getValueStringLength(row.original.value) > MAX_CELL_DISPLAY_CHARS;

    const { props: rowClickProps } = useClickWithoutSelection({
      onClick: () => {
        handleRowExpansion(
          row,
          onLazyLoadChildren,
          expandedCells,
          toggleCellExpansion,
        );
      },
      enabled: isExpandable,
    });

    return (
      <tr
        ref={
          rowIndex === 0 && row.original.level === 0
            ? topLevelRowRef
            : undefined
        }
        data-observation-id={row.id}
        {...rowClickProps}
        className={cn(
          "hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors",
          isExpandable ? "cursor-pointer" : "",
          row.original.level === 0 && stickyTopLevelKey
            ? "bg-background sticky top-0 z-10 shadow-xs"
            : "",
        )}
      >
        {row.getVisibleCells().map((cell) => (
          <td
            key={cell.id}
            className={cn(
              "h-full border-b [:last-child_>_&]:border-b-0",
              CELL_CLASSES,
              cell.column.id === "value" && "[&>div]:wrap-anywhere",
            )}
            style={{ width: `${cell.column.columnDef.size}%` }}
          >
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </td>
        ))}
      </tr>
    );
  },
);

JsonTableRowComponent.displayName = "JsonTableRow";

function JsonPrettyTable({
  data,
  expandAllRef,
  onExpandStateChange,
  noBorder = false,
  expanded,
  onExpandedChange,
  onLazyLoadChildren,
  onForceUpdate,
  smartDefaultsLevel,
  expandedCells,
  toggleCellExpansion,
  stickyTopLevelKey = false,
  showObservationTypeBadge = false,
  rowActions,
}: {
  data: JsonTableRow[];
  expandAllRef?: React.RefObject<(() => void) | null>;
  onExpandStateChange?: (allExpanded: boolean) => void;
  noBorder?: boolean;
  expanded: ExpandedState;
  onExpandedChange: (
    updater: ExpandedState | ((prev: ExpandedState) => ExpandedState),
  ) => void;
  onLazyLoadChildren?: (rowId: string) => void;
  onForceUpdate?: () => void;
  smartDefaultsLevel?: number | null;
  expandedCells: Set<string>;
  toggleCellExpansion: (cellId: string) => void;
  stickyTopLevelKey?: boolean;
  showObservationTypeBadge?: boolean;
  rowActions?: React.ComponentProps<typeof ValueCell>["rowActions"];
  /** Drop the Path / Value header row. */
}) {
  const topLevelRowRef = useRef<HTMLTableRowElement>(null);
  const [topLevelRowHeight, setTopLevelRowHeight] = useState(32);

  useEffect(() => {
    if (stickyTopLevelKey && topLevelRowRef.current) {
      setTopLevelRowHeight(topLevelRowRef.current.offsetHeight);
    }
  }, [stickyTopLevelKey, data, expanded]);

  const indentationWidthFor = (row: Row<JsonTableRow>) =>
    row.original.level * INDENTATION_PER_LEVEL + INDENTATION_BASE;

  const renderKeyText = (key: string) =>
    key.includes(".")
      ? key.split(".").map((segment, index, segments) => (
          <span key={index}>
            {segment}
            {index < segments.length - 1 && (
              <>
                .<wbr />
              </>
            )}
          </span>
        ))
      : key;

  const renderKey = (row: Row<JsonTableRow>) => {
    const indentationWidth = indentationWidthFor(row);

    const itemBadgeType =
      showObservationTypeBadge &&
      row.original.level === 0 &&
      row.original.value &&
      typeof row.original.value === "object" &&
      !Array.isArray(row.original.value) &&
      "type" in row.original.value &&
      typeof row.original.value.type === "string" &&
      row.original.value.type
        ? (row.original.value.type as LangfuseItemType)
        : null;

    return (
      <div className="flex w-max max-w-[40cqw] min-w-40 items-start gap-1 text-xs/5 wrap-break-word">
        <div
          className="flex h-[1lh] shrink-0 items-center justify-end"
          style={{ width: `${indentationWidth}px` }}
        >
          {row.original.hasChildren ? (
            <Button
              variant="ghost"
              size="sm"
              aria-label={`${row.getIsExpanded() ? "Collapse" : "Expand"} ${row.original.key}`}
              aria-expanded={row.getIsExpanded()}
              onClick={(e) => {
                e.stopPropagation();
                handleRowExpansion(
                  row,
                  onLazyLoadChildren,
                  expandedCells,
                  toggleCellExpansion,
                );
              }}
              className="text-muted-foreground hover:text-foreground h-4 w-4 p-0 hover:bg-transparent"
            >
              {row.getIsExpanded() ? (
                <ChevronDown size="base" color="default" />
              ) : (
                <ChevronRight size="base" color="default" />
              )}
            </Button>
          ) : null}
        </div>
        <span className={cn("min-w-0 cursor-text", KEY_CLASSES)}>
          {itemBadgeType && (
            <span className="mr-1 inline-block align-middle">
              <ItemBadge type={itemBadgeType} isSmall={true} />
            </span>
          )}
          {renderKeyText(row.original.key)}
        </span>
      </div>
    );
  };

  const renderValue = (row: Row<JsonTableRow>) => (
    <ValueCell
      row={row}
      expandedCells={expandedCells}
      toggleCellExpansion={toggleCellExpansion}
      preserveStringWhitespace={row.original.key === "code_eval_source_code"}
      rowActions={rowActions}
    />
  );

  const keyColumn: LangfuseColumnDef<JsonTableRow, unknown> = {
    accessorKey: "key",
    header: "Path",
    size: 1,
    cell: ({ row }) => {
      const content = renderKey(row);
      const valueLength = getValueStringLength(row.original.value);
      const isLongValue = valueLength > MAX_CELL_DISPLAY_CHARS / 3; // already long if we don't truncate

      if (isLongValue) {
        // Offset by the section header where the host pins it (--io-header-h).
        const headerOffset = "var(--io-header-h, 0px)";
        let topPosition = headerOffset;
        if (stickyTopLevelKey && row.original.level !== 0) {
          topPosition = `calc(${headerOffset} + ${topLevelRowHeight}px)`;
        }

        return (
          <div className="sticky z-5 -my-1 py-1" style={{ top: topPosition }}>
            {content}
          </div>
        );
      }

      return content;
    },
  };

  const valueColumn: LangfuseColumnDef<JsonTableRow, unknown> = {
    accessorKey: "value",
    header: "Value",
    size: 99,
    cell: ({ row }) => renderValue(row),
  };

  const columns: LangfuseColumnDef<JsonTableRow, unknown>[] = [
    keyColumn,
    valueColumn,
  ];

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getSubRows: (row) => row.subRows,
    getRowId: (row) => convertRowIdToKeyPath(row.id),
    state: {
      expanded,
    },
    onExpandedChange: onExpandedChange,
    enableColumnResizing: false,
    autoResetExpanded: false,
  });

  const allRowsExpanded = useMemo(() => {
    const allRows = table.getRowModel().flatRows;
    const expandableRows = allRows.filter((row) => row.original.hasChildren);
    return (
      expandableRows.length > 0 &&
      expandableRows.every((row) => row.getIsExpanded())
    );
    // expanded is required for the collapse button to work
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, expanded]);

  // Notify parent of expand state changes
  useEffect(() => {
    onExpandStateChange?.(allRowsExpanded);
  }, [allRowsExpanded, onExpandStateChange]);

  const expandRowsWithLazyLoading = useCallback(
    (
      rowFilter: (rows: Row<JsonTableRow>[]) => Row<JsonTableRow>[],
      shouldCollapse = false,
    ) => {
      if (shouldCollapse) {
        onExpandedChange({});
        return;
      }

      const allRows = table.getRowModel().flatRows;
      const expandableRows = allRows.filter((row) => row.original.hasChildren);
      const targetRows = rowFilter(expandableRows);

      const rowsNeedingParsing = targetRows.filter(
        (row) => row.original.rawChildData && !row.original.childrenGenerated,
      );

      if (rowsNeedingParsing.length > 0) {
        const generatedRowIds: string[] = [];

        rowsNeedingParsing.forEach((row) => {
          generateAllChildrenRecursively(row.original, (rowId) => {
            generatedRowIds.push(rowId);
          });
        });

        if (generatedRowIds.length > 0) {
          onLazyLoadChildren?.(generatedRowIds.join(","));
        }

        onForceUpdate?.();
        // setTimeout re-renders table once new data is available
        setTimeout(() => {
          const newExpanded: ExpandedState = {};
          const updatedAllRows = table.getRowModel().flatRows;
          const updatedExpandableRows = updatedAllRows.filter(
            (row) => row.original.hasChildren,
          );
          const updatedTargetRows = rowFilter(updatedExpandableRows);

          updatedTargetRows.forEach((row) => {
            newExpanded[row.id] = true;
          });

          onExpandedChange(newExpanded);
        }, 0);
      } else {
        // No lazy loading needed, just set expansion state
        const newExpanded: ExpandedState = {};
        targetRows.forEach((row) => {
          newExpanded[row.id] = true;
        });
        onExpandedChange(newExpanded);
      }
    },
    [table, onExpandedChange, onLazyLoadChildren, onForceUpdate],
  );

  const handleToggleExpandAll = useCallback(() => {
    expandRowsWithLazyLoading(
      (expandableRows) => expandableRows, // All expandable rows
      allRowsExpanded, // Should collapse if already expanded
    );
  }, [allRowsExpanded, expandRowsWithLazyLoading]);

  useEffect(() => {
    if (expandAllRef) {
      expandAllRef.current = handleToggleExpandAll;
    }
  }, [expandAllRef, handleToggleExpandAll]);

  useEffect(() => {
    if (smartDefaultsLevel != null && smartDefaultsLevel > 0) {
      expandRowsWithLazyLoading((expandableRows) =>
        expandableRows.filter((row) => row.depth < smartDefaultsLevel),
      );
    }
  }, [smartDefaultsLevel, expandRowsWithLazyLoading]);

  return (
    <div className={cn("w-full", !noBorder && "rounded-sm border")}>
      <table className="w-full table-auto caption-bottom border-separate border-spacing-0 space-y-4 overflow-auto text-sm">
        <thead className="sr-only">
          <tr>
            <th scope="col">Path</th>
            <th scope="col">Value</th>
          </tr>
        </thead>
        <tbody className="text-xs [&_tr:last-child]:border-0">
          {table.getRowModel().rows.map((row, rowIndex) => (
            <JsonTableRowComponent
              key={row.id}
              row={row}
              rowIndex={rowIndex}
              topLevelRowRef={
                rowIndex === 0 && row.original.level === 0
                  ? topLevelRowRef
                  : undefined
              }
              onLazyLoadChildren={onLazyLoadChildren}
              expandedCells={expandedCells}
              toggleCellExpansion={toggleCellExpansion}
              stickyTopLevelKey={stickyTopLevelKey}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PrettyJsonViewContent(props: {
  state: JsonViewState;
  title?: string;
  className?: string;
  codeClassName?: string;
  collapseStringsAfterLength?: number | null;
  scrollable?: boolean;
  borderless?: boolean;
  stickyTopLevelKey?: boolean;
  showObservationTypeBadge?: boolean;
  rowActions?: React.ComponentProps<typeof ValueCell>["rowActions"];
}) {
  const {
    largeStringValue,
    jsonViewInput,
    markdownContent,
    standaloneMediaReferenceStrings,
    remainingMarkdownMedia,
    tableData,
    expandAllRef,
    setAllRowsExpanded,
    actualExpansionState,
    handleTableExpandedChange,
    handleLazyLoadChildren,
    handleForceUpdate,
    expandedCells,
    toggleCellExpansion,
    jsonIsCollapsed,
    handleJsonToggleCollapse,
    isLoading,
    isParsing,
    media,
  } = props.state;
  const codeClassName = props.codeClassName;
  const tableBorderless = props.borderless ?? false;
  const contentKind = props.state.contentKind;
  const isPrettyView = props.state.currentView === "pretty";
  const isMarkdownMode = contentKind === "markdown";
  const shouldUseTableView = contentKind === "table";
  const shouldRenderStandaloneMedia =
    isMarkdownMode && standaloneMediaReferenceStrings.length > 0;
  const emptyValueDisplay = getEmptyValueDisplay(props.state.parsedJson);

  const body = (
    <>
      {largeStringValue !== null ? (
        <LargeStringFallback title={props.title} value={largeStringValue} />
      ) : isLoading || isParsing ? (
        <div className="io-message-content ph-no-capture">
          <div
            className={cn(
              getContainerClasses(
                props.scrollable,
                codeClassName,
                undefined,
                tableBorderless,
              ),
            )}
          >
            <div className="space-y-2">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-3 w-2/3" />
              {isParsing && (
                <div className="text-muted-foreground mt-2 text-xs">
                  Parsing in background...
                </div>
              )}
            </div>
          </div>
        </div>
      ) : emptyValueDisplay && isPrettyView ? (
        <div className="io-message-content ph-no-capture">
          <div
            className={cn(
              "flex items-center",
              getContainerClasses(
                props.scrollable,
                codeClassName,
                undefined,
                tableBorderless,
              ),
            )}
          >
            <span className={`font-mono ${PREVIEW_TEXT_CLASSES}`}>
              {emptyValueDisplay}
            </span>
          </div>
        </div>
      ) : isMarkdownMode ? (
        <div className="io-message-content ph-no-capture">
          {shouldRenderStandaloneMedia ? (
            standaloneMediaReferenceStrings.map((referenceString, index) => (
              <LangfuseMediaView
                key={`${referenceString}-${index}`}
                mediaReferenceString={referenceString}
              />
            ))
          ) : (
            <MarkdownView
              markdown={markdownContent || ""}
              media={media}
              className={cn(tableBorderless && "p-0")}
            />
          )}
        </div>
      ) : (
        <>
          {/* Always render JsonPrettyTable to preserve internal React Table state */}
          <div
            className="io-message-content ph-no-capture"
            style={{ display: shouldUseTableView ? "flex" : "none" }}
          >
            <div
              className={cn(
                getContainerClasses(
                  props.scrollable,
                  codeClassName,
                  "flex text-xs wrap-break-word whitespace-pre-wrap",
                  tableBorderless,
                ),
                "@container w-full",
              )}
            >
              {isLoading ? (
                <Skeleton className="m-3 h-3 w-3/4" />
              ) : (
                <JsonPrettyTable
                  data={tableData}
                  expandAllRef={expandAllRef}
                  onExpandStateChange={setAllRowsExpanded}
                  noBorder={true}
                  expanded={
                    actualExpansionState === false ? {} : actualExpansionState
                  }
                  onExpandedChange={handleTableExpandedChange}
                  onLazyLoadChildren={handleLazyLoadChildren}
                  onForceUpdate={handleForceUpdate}
                  smartDefaultsLevel={null}
                  expandedCells={expandedCells}
                  toggleCellExpansion={toggleCellExpansion}
                  stickyTopLevelKey={props.stickyTopLevelKey}
                  showObservationTypeBadge={props.showObservationTypeBadge}
                  rowActions={props.rowActions}
                />
              )}
            </div>
          </div>

          {/* Always render JSONView to preserve its state too */}
          <div
            className="io-message-content ph-no-capture"
            style={{ display: shouldUseTableView ? "none" : "block" }}
          >
            <JSONView
              // Use the unicode-decoded payload so that \uXXXX escapes from
              // Python SDK ensure_ascii=True render as original characters.
              // Pass a clone to avoid JSONView's internal deepParseJson
              // mutating the shared parsedJson / rawChildData tree.
              json={jsonViewInput}
              className=""
              borderless={tableBorderless}
              isLoading={isLoading}
              codeClassName={codeClassName}
              collapseStringsAfterLength={props.collapseStringsAfterLength}
              media={media}
              scrollable={props.scrollable}
              externalJsonCollapsed={jsonIsCollapsed}
              onToggleCollapse={handleJsonToggleCollapse}
            />
          </div>
        </>
      )}
      {shouldRenderStandaloneMedia && remainingMarkdownMedia.length > 0 && (
        <>
          <div className="text-muted-foreground my-1 px-2 py-1 text-xs">
            Media
          </div>
          <div className="ph-no-capture flex flex-wrap gap-2 px-2 pt-1 pb-4">
            {remainingMarkdownMedia.map((m) => (
              <LangfuseMediaView
                mediaAPIReturnValue={m}
                variant="icon"
                key={m.mediaId}
              />
            ))}
          </div>
        </>
      )}
      {media && media.length > 0 && isPrettyView && !isMarkdownMode && (
        <>
          <div className="text-muted-foreground my-1 px-2 py-1 text-xs">
            Media
          </div>
          <div className="ph-no-capture flex flex-wrap gap-2 px-2 pt-1 pb-4">
            {media.map((m) => (
              <LangfuseMediaView
                mediaAPIReturnValue={m}
                variant="icon"
                key={m.mediaId}
              />
            ))}
          </div>
        </>
      )}
    </>
  );

  const scrollableBody = props.scrollable ? (
    <div
      className={cn(
        "flex h-full min-h-0 overflow-hidden",
        isMarkdownMode || (shouldUseTableView && tableBorderless)
          ? ""
          : "rounded-sm border",
      )}
    >
      <div className="max-h-full min-h-0 w-full overflow-y-auto">{body}</div>
    </div>
  ) : (
    body
  );

  return (
    <div
      className={cn(
        "flex max-h-full min-h-0 flex-col",
        props.className,
        props.scrollable ? "overflow-hidden" : "",
      )}
    >
      {scrollableBody}
    </div>
  );
}
