/* eslint-disable @repo/no-style-props */
import {
  Fragment,
  useMemo,
  useState,
  useEffect,
  useRef,
  useCallback,
  memo,
} from "react";
import { cn } from "@/src/utils/tailwind";
import { deepParseJson } from "@langfuse/shared";
import { decodeUnicodeInJson } from "@/src/utils/decodeUnicodeInJson";
import { Skeleton } from "@/src/components/ui/skeleton";
import { type MediaReturnType } from "@/src/features/media/validation";
import { LangfuseMediaView } from "@/src/components/ui/LangfuseMediaView";
import { MarkdownJsonViewHeader } from "@/src/components/ui/MarkdownJsonView";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { Button } from "@/src/components/ui/button";
import { useClickWithoutSelection } from "@/src/hooks/useClickWithoutSelection";
import { useCollapsibleSystemPrompt } from "@/src/hooks/useCollapsibleSystemPrompt";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  UnfoldVertical,
  FoldVertical,
  Palette,
} from "lucide-react";
import {
  DropdownMenuCheckboxItem,
  DropdownMenuController,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from "@/src/components/ui/dropdown-menu";
import {
  classifyJsonShape,
  clearStoredJsonTableStyleVariants,
  DEFAULT_JSON_TABLE_DATA_CLASS,
  DEFAULT_JSON_TABLE_STYLE_VARIANT,
  FINALIST_JSON_TABLE_STYLE_VARIANTS,
  JSON_TABLE_CLASS_MODE_LABELS,
  JSON_TABLE_CLASS_MODES,
  JSON_TABLE_DATA_CLASS_LABELS,
  JSON_TABLE_DATA_CLASSES,
  JSON_TABLE_STYLE_VARIANTS,
  JSON_TABLE_STYLES,
  type JsonTableClassMode,
  type JsonTableDataClass,
  type JsonTableStyle,
  type JsonTableStyleVariant,
  LONG_CONTENT_JSON_TABLE_STYLE_VARIANT,
  useJsonTableClassMode,
  useJsonTableStyleVariant,
  useShowAllJsonTableStyles,
  useShowJsonTableStylePicker,
  useStoredJsonTableClassMode,
  useStoredJsonTableStyleVariant,
  writeStoredJsonTableClassMode,
  writeStoredJsonTableStylePick,
  writeStoredJsonTableStyleVariant,
} from "@/src/components/ui/jsonTableStyleVariants";
import { usePinnedJsonTableStyleVariant } from "@/src/components/ui/jsonViewPreference";
import {
  useReactTable,
  getCoreRowModel,
  getExpandedRowModel,
  flexRender,
  type ExpandedState,
  type Row,
} from "@tanstack/react-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";

// Custom expanded state type that allows false ("user intentionally collapsed all")
type LangfuseExpandedState = ExpandedState | false;
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { ChatMlArraySchema } from "@/src/components/schemas/ChatMlSchema";
import { MarkdownView } from "@/src/components/ui/MarkdownViewer";
import {
  filterAlreadyRenderedMedia,
  getRenderedInlineMediaIds,
  getStandaloneMediaReferenceStrings,
} from "@/src/components/ui/markdown-media.utils";
import {
  StringOrMarkdownSchema,
  containsAnyMarkdown,
} from "@/src/components/schemas/MarkdownSchema";
import { useMarkdownRenderCharacterLimit } from "@/src/hooks/useMarkdownRenderCharacterLimit";
import {
  convertRowIdToKeyPath,
  getSmartExpansionState,
  type JsonTableRow,
  transformJsonToTableData,
} from "@/src/components/table/utils/jsonExpansionUtils";
import {
  ValueCell,
  getValueStringLength,
  type MetadataFilterActions,
} from "@/src/components/table/ValueCell";
import { ItemBadge, type LangfuseItemType } from "@/src/components/ItemBadge";
import { isLargeRenderString } from "@/src/components/ui/largeStringGate";
import { LargeStringFallback } from "@/src/components/ui/LargeStringFallback";

// Constants for table layout (the level-0 chevron column width comes from the
// active style direction, see jsonTableStyleVariants.ts)
const INDENTATION_PER_LEVEL = 16;
const BUTTON_WIDTH = 16;
const MARGIN_LEFT_1 = 4;
const CELL_PADDING_X = 8; // px-2

// Constants for smart expansion logic
// Used for nested objects to control smart expansion depth
const DEFAULT_MAX_ROWS = 20;
// Used for root-level objects where user has no parent to expand from. Therefore,
// set higher to ensure objects like metadata with many keys are still displayed
const DEFAULT_MAX_ROWS_IF_ROOT = 100;

const MAX_CELL_DISPLAY_CHARS = 2000;

const ASSISTANT_TITLES = ["assistant", "Output", "model"];
const SYSTEM_TITLES = ["system", "Input"];

const PREVIEW_TEXT_CLASSES = "italic text-gray-500 dark:text-gray-400";

type PrettyJsonViewTone = "danger" | "warning" | "muted" | "neutral";

const PRETTY_JSON_VIEW_TONE_CLASSES: Record<
  PrettyJsonViewTone,
  { container: string; row: string; cell: string }
> = {
  danger: {
    container:
      "border-dark-red/30 bg-light-red/50 dark:border-dark-red/20 dark:bg-light-red/35",
    row: "hover:bg-light-red/50 dark:hover:bg-light-red/35",
    cell: "border-dark-red/20 dark:border-dark-red/15",
  },
  warning: {
    container: "border-dark-yellow/40 bg-light-yellow/80",
    row: "hover:bg-light-yellow/80",
    cell: "border-dark-yellow/20",
  },
  muted: {
    container: "border-muted-foreground/15 bg-muted/30 text-muted-foreground",
    row: "hover:bg-muted/30",
    cell: "border-muted-foreground/15",
  },
  neutral: {
    container: "bg-card",
    row: "hover:bg-card",
    cell: "border-border",
  },
};

// decodeUnicodeInJson was extracted to a standalone module so that other JSON
// viewers (e.g. CodeJsonViewer) can reuse it without creating an import cycle.
// Re-exported here for backward compatibility with existing imports and tests.
export {
  decodeUnicodeInJson,
  DECODE_UNICODE_MAX_NODES,
  DECODE_UNICODE_MAX_DEPTH,
} from "@/src/utils/decodeUnicodeInJson";

function shouldShowValue(value: unknown, showNullValues: boolean): boolean {
  if (showNullValues) return true;
  return value !== null && value !== "" && value !== 0;
}

function filterTableRows(
  rows: JsonTableRow[],
  showNullValues: boolean,
): JsonTableRow[] {
  if (showNullValues) return rows;

  return rows
    .filter((row) => shouldShowValue(row.value, showNullValues))
    .map((row) => ({
      ...row,
      subRows: row.subRows
        ? filterTableRows(row.subRows, showNullValues)
        : row.subRows,
    }));
}

function getEmptyValueDisplay(value: unknown): string | null {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (value === "") return "empty string";
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  ) {
    return "empty object";
  }
  return null;
}

function getContainerClasses(
  title: string | undefined,
  scrollable: boolean | undefined,
  codeClassName: string | undefined,
  baseClasses = "whitespace-pre-wrap wrap-break-word p-3 text-xs",
  borderless = false,
) {
  return cn(
    baseClasses,
    ASSISTANT_TITLES.includes(title || "")
      ? "bg-accent-light-green dark:border-accent-dark-green/30"
      : "",
    SYSTEM_TITLES.includes(title || "") ? "bg-card" : "",
    scrollable || borderless ? "" : "rounded-sm border",
    codeClassName,
  );
}

function isChatMLFormat(json: unknown): boolean {
  if (!json || typeof json !== "object") return false;

  if (Array.isArray(json)) {
    const directArray = ChatMlArraySchema.safeParse(json);
    if (directArray.success) {
      // had some false positives, so we really check for role AND content to validate ChatML
      const hasRoleAndContent = json.some(
        (item) =>
          typeof item === "object" &&
          item !== null &&
          "role" in item &&
          "content" in item,
      );
      return hasRoleAndContent;
    }
  }

  if ("messages" in json && Array.isArray((json as any).messages)) {
    const messagesArray = ChatMlArraySchema.safeParse((json as any).messages);
    if (messagesArray.success) return true;
  }

  if (Array.isArray(json) && json.length === 1 && Array.isArray(json[0])) {
    const nestedArray = ChatMlArraySchema.safeParse(json[0]);
    if (nestedArray.success) return true;
  }

  return false;
}

function isMarkdownContent(
  json: unknown,
  characterLimit: number,
): {
  isMarkdown: boolean;
  content?: string;
} {
  const contentSize = JSON.stringify(json || {}).length;
  if (contentSize > characterLimit) {
    return { isMarkdown: false };
  }

  if (typeof json === "string") {
    const markdownResult = StringOrMarkdownSchema.safeParse(json);
    if (markdownResult.success) {
      return { isMarkdown: true, content: json };
    }
  }

  // also render as MD if object has one key and the value is a markdown like string
  if (
    typeof json === "object" &&
    json !== null &&
    !Array.isArray(json) &&
    json.constructor === Object
  ) {
    const entries = Object.entries(json);
    if (entries.length === 1) {
      const [, value] = entries[0];
      if (typeof value === "string") {
        if (containsAnyMarkdown(value)) {
          return { isMarkdown: true, content: value };
        }
      }
    }
  }

  return { isMarkdown: false };
}

function getValueType(value: unknown): JsonTableRow["type"] {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return "array";
  return typeof value as JsonTableRow["type"];
}

function hasChildren(value: unknown, valueType: JsonTableRow["type"]): boolean {
  return (
    (valueType === "object" &&
      Object.keys(value as Record<string, unknown>).length > 0) ||
    (valueType === "array" && Array.isArray(value) && value.length > 0)
  );
}

function generateChildRows(row: JsonTableRow): JsonTableRow[] {
  if (!row.rawChildData || row.childrenGenerated) {
    return row.subRows || [];
  }

  const children = transformJsonToTableData(
    row.rawChildData,
    row.key,
    row.level + 1,
    row.id,
    false, // Don't use lazy loading for children
  );

  return children;
}

function generateAllChildrenRecursively(
  row: JsonTableRow,
  onRowGenerated?: (rowId: string) => void,
): void {
  if (row.rawChildData && !row.childrenGenerated) {
    const children = generateChildRows(row);
    row.subRows = children;
    row.childrenGenerated = true;

    // this row now has generated children for state preservation (expand all)
    onRowGenerated?.(row.id);

    children.forEach((child) => {
      generateAllChildrenRecursively(child, onRowGenerated);
    });
  }
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

interface JsonTableRowProps {
  row: Row<JsonTableRow>;
  rowIndex: number;
  topLevelRowRef?: React.RefObject<HTMLTableRowElement | null>;
  onLazyLoadChildren?: (rowId: string) => void;
  expandedCells: Set<string>;
  toggleCellExpansion: (cellId: string) => void;
  stickyTopLevelKey: boolean;
  stickyOffsets: { header: number; row: number };
  toneClasses?: (typeof PRETTY_JSON_VIEW_TONE_CLASSES)[PrettyJsonViewTone];
  style: JsonTableStyle;
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
    stickyOffsets,
    toneClasses,
    style,
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
      <TableRow
        ref={
          rowIndex === 0 && row.original.level === 0
            ? topLevelRowRef
            : undefined
        }
        data-observation-id={row.id}
        {...rowClickProps}
        className={cn(
          isExpandable ? "cursor-pointer" : "",
          style.row,
          row.original.level === 0 && stickyTopLevelKey
            ? "bg-background sticky z-10 shadow-xs"
            : "",
          toneClasses?.row,
        )}
        style={
          row.original.level === 0 && stickyTopLevelKey
            ? { top: `${stickyOffsets.header}px` }
            : undefined
        }
      >
        {row.getVisibleCells().map((cell) => (
          <TableCell
            key={cell.id}
            className={cn(
              style.cell,
              style.zebra &&
                rowIndex % 2 === 1 &&
                "bg-muted/40 first:rounded-l-md last:rounded-r-md",
              // Auto table layout sizes the key column to content; unbreakable
              // value tokens (URLs, paths) must not push the table wider.
              style.layout === "columns" &&
                style.keyColumn === "content" &&
                cell.column.id === "value" &&
                "[&>div]:wrap-anywhere",
              toneClasses?.cell,
            )}
            style={{ width: `${cell.column.columnDef.size}%` }}
          >
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </TableCell>
        ))}
      </TableRow>
    );
  },
);

JsonTableRowComponent.displayName = "JsonTableRow";

function JsonPrettyTable({
  data,
  expandAllRef,
  onExpandStateChange,
  noBorder = false,
  hideHeader = false,
  expanded,
  onExpandedChange,
  onLazyLoadChildren,
  onForceUpdate,
  smartDefaultsLevel,
  expandedCells,
  toggleCellExpansion,
  stickyTopLevelKey = false,
  showObservationTypeBadge = false,
  metadataActions,
  toneClasses,
  style,
}: {
  data: JsonTableRow[];
  expandAllRef?: React.RefObject<(() => void) | null>;
  onExpandStateChange?: (allExpanded: boolean) => void;
  noBorder?: boolean;
  hideHeader?: boolean;
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
  metadataActions?: MetadataFilterActions;
  toneClasses?: (typeof PRETTY_JSON_VIEW_TONE_CLASSES)[PrettyJsonViewTone];
  style: JsonTableStyle;
}) {
  const headerRef = useRef<HTMLTableRowElement>(null);
  const topLevelRowRef = useRef<HTMLTableRowElement>(null);
  const [stickyOffsets, setStickyOffsets] = useState({ header: 32, row: 32 });

  // calculate height of top row to calculate offsets for other headings to not go beneath sticky rows
  useEffect(() => {
    if (stickyTopLevelKey) {
      // Header may be hidden (title-owned tables): then rows stick at 0.
      const headerHeight = headerRef.current?.offsetHeight ?? 0;

      // get first top-level row height (if it exists)
      let rowHeight = 32; // default fallback
      if (topLevelRowRef.current) {
        rowHeight = topLevelRowRef.current.offsetHeight;
      }

      setStickyOffsets({
        header: headerHeight,
        row: rowHeight,
      });
    }
  }, [stickyTopLevelKey, hideHeader, data, expanded]);

  const indentationWidthFor = (row: Row<JsonTableRow>) =>
    row.original.level * INDENTATION_PER_LEVEL + style.indentBase;

  // Content-sized key column: the table switches to auto layout and the key
  // cell shrinks to its longest key, capped at 40 % of the table (`cqw`
  // resolves against the `@container` set by PrettyJsonView).
  const contentSizedKeys =
    style.layout === "columns" && style.keyColumn === "content";

  // Guide-line variants move the row's vertical padding from the cell onto
  // the key / value content so the guides run edge to edge between rows.
  const contentPadY = style.indentGuides ? "py-1" : "";

  const renderKeyText = (key: string) =>
    style.breakKeysAtDots && key.includes(".")
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

  const renderKey = (row: Row<JsonTableRow>, constrainWidth: boolean) => {
    // we need to calculate the indentation here for a good line break
    // because of the padding, we don't know when to break the line otherwise
    const indentationWidth = indentationWidthFor(row);
    const buttonWidth = row.original.hasChildren ? BUTTON_WIDTH : 0;
    const availableTextWidth = `calc(100% - ${indentationWidth + buttonWidth + CELL_PADDING_X + MARGIN_LEFT_1}px)`;

    const itemBadgeType =
      showObservationTypeBadge &&
      row.original.level === 0 &&
      row.original.value &&
      typeof row.original.value === "object" &&
      !Array.isArray(row.original.value) &&
      "type" in row.original.value &&
      typeof (row.original.value as any).type === "string" &&
      (row.original.value as any).type
        ? ((row.original.value as any).type as LangfuseItemType)
        : null;

    return (
      <div
        className={cn(
          "flex wrap-break-word",
          style.indentGuides ? "items-stretch" : "items-start",
          // w-max keeps the column at the longest key (up to the cap) instead
          // of letting long values squeeze it to its narrowest wrap.
          contentSizedKeys && "w-max max-w-[40cqw]",
        )}
      >
        <div
          className={cn(
            "relative flex shrink-0 justify-end",
            style.indentGuides ? "items-start pt-1" : "items-center",
          )}
          style={{ width: `${indentationWidth}px` }}
        >
          {style.indentGuides &&
            Array.from({ length: row.original.level }, (_, level) => (
              <span
                key={level}
                aria-hidden
                className="bg-border absolute inset-y-0 w-px"
                style={{
                  left: `${style.indentBase + level * INDENTATION_PER_LEVEL - BUTTON_WIDTH / 2}px`,
                }}
              />
            ))}
          {row.original.hasChildren ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleRowExpansion(
                  row,
                  onLazyLoadChildren,
                  expandedCells,
                  toggleCellExpansion,
                );
              }}
              className="h-4 w-4 p-0"
            >
              {row.getIsExpanded() ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </Button>
          ) : style.leafDot ? (
            <span className="flex h-4 w-4 items-center justify-center">
              <span
                aria-hidden
                className="bg-muted-foreground/50 h-1 w-1 rounded-full"
              />
            </span>
          ) : null}
        </div>
        <span
          className={cn(
            "ml-1 cursor-text",
            style.key,
            contentPadY,
            // A flex item cannot shrink below its min-content width, and an
            // undotted key is one unbreakable word: without min-w-0 a key
            // longer than the column cap overflows the cell into the value.
            contentSizedKeys && "min-w-0",
          )}
          style={constrainWidth ? { maxWidth: availableTextWidth } : undefined}
        >
          {style.connector && row.original.level > 0 && (
            <span aria-hidden className="text-muted-foreground mr-1">
              └
            </span>
          )}
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
      metadataActions={metadataActions}
      collapsedPreview={style.collapsedPreview}
      expandedParentSummary={style.expandedParentSummary}
    />
  );

  // key above value, value indented to the key.
  const renderStackedCell = (row: Row<JsonTableRow>) => (
    <div className="flex flex-col gap-1 wrap-break-word">
      {renderKey(row, false)}
      {row.getIsExpanded() && row.subRows.length > 0 ? null : (
        <div
          style={{
            paddingLeft: `${indentationWidthFor(row) + MARGIN_LEFT_1}px`,
          }}
        >
          {renderValue(row)}
        </div>
      )}
    </div>
  );

  const isLongString = (row: Row<JsonTableRow>) =>
    typeof row.original.value === "string" &&
    (row.original.value.length > 80 || row.original.value.includes("\n"));

  const keyColumn: LangfuseColumnDef<JsonTableRow, unknown> = {
    accessorKey: "key",
    header: "Path",
    size: contentSizedKeys ? 1 : 35,
    cell: ({ row }) => {
      const content = renderKey(row, !contentSizedKeys);
      const valueLength = getValueStringLength(row.original.value);
      const isLongValue = valueLength > MAX_CELL_DISPLAY_CHARS / 3; // already long if we don't truncate

      if (isLongValue) {
        // calculate sticky position based on level and stickyTopLevelKey setting
        let topPosition = "0";
        if (stickyTopLevelKey) {
          // Level 0: position below header
          // Level > 0: position below header + one top-level row
          topPosition =
            row.original.level === 0
              ? `${stickyOffsets.header}px`
              : `${stickyOffsets.header + stickyOffsets.row}px`;
        }

        return (
          // py-1 with -my-1 keeps the sticky box padded when it sticks under
          // the header without adding height, so the key stays on the value's
          // baseline instead of sitting one padding step lower.
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
    size: contentSizedKeys ? 99 : 65,
    cell: ({ row }) => renderValue(row),
  };

  // tree: `key: value` on one line, no columns.
  const inlineColumn: LangfuseColumnDef<JsonTableRow, unknown> = {
    accessorKey: "key",
    header: "Field",
    size: 100,
    cell: ({ row }) => {
      if (style.longValuesBelowKey && isLongString(row)) {
        return renderStackedCell(row);
      }
      return (
        <div
          className={cn(
            "flex wrap-break-word",
            style.indentGuides ? "items-stretch" : "items-start",
          )}
        >
          {renderKey(row, false)}
          {style.inlineSeparator ? (
            <span
              className={cn(
                "text-muted-foreground mr-1.5 text-xs",
                contentPadY,
              )}
            >
              :
            </span>
          ) : (
            <span className="w-2 shrink-0" />
          )}
          <div className={cn("min-w-0 flex-1", contentPadY)}>
            {renderValue(row)}
          </div>
        </div>
      );
    },
  };

  const stackedColumn: LangfuseColumnDef<JsonTableRow, unknown> = {
    accessorKey: "key",
    header: "Field",
    size: 100,
    cell: ({ row }) => renderStackedCell(row),
  };

  const columns: LangfuseColumnDef<JsonTableRow, unknown>[] =
    style.layout === "columns"
      ? [keyColumn, valueColumn]
      : style.layout === "inline"
        ? [inlineColumn]
        : [stackedColumn];

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
      <Table className={cn(contentSizedKeys && "table-auto")}>
        {hideHeader ? null : (
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup, index) => (
              <TableRow
                key={headerGroup.id}
                ref={index === 0 ? headerRef : undefined}
                className={cn(
                  stickyTopLevelKey ? "sticky top-0 z-20" : "",
                  toneClasses?.row,
                )}
              >
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={cn(
                      "h-8 px-2 py-1",
                      stickyTopLevelKey ? "bg-background" : "bg-transparent",
                      toneClasses?.cell,
                    )}
                    style={{ width: `${header.column.columnDef.size}%` }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
        )}
        <TableBody>
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
              stickyOffsets={stickyOffsets}
              toneClasses={toneClasses}
              style={style}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Copy and expand all for a table that renders without a header to host
    them: no section title (MarkdownJsonViewHeader) and no Path / Value row.
    Anchored to the table's top right corner, revealed on hover and on
    keyboard focus. */
function JsonTableHoverControls({
  allRowsExpanded,
  onToggleExpandAll,
  onCopy,
}: {
  allRowsExpanded: boolean;
  onToggleExpandAll: () => void;
  onCopy: (event?: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const [isCopied, setIsCopied] = useState(false);
  const expandLabel = allRowsExpanded ? "Collapse all rows" : "Expand all rows";

  return (
    <div className="bg-background absolute top-0.5 right-0.5 z-10 flex items-center gap-0.5 rounded-sm opacity-0 transition-opacity group-hover/json-table:opacity-100 focus-within:opacity-100">
      <Button
        variant="ghost"
        size="icon-xs"
        type="button"
        onClick={onToggleExpandAll}
        className="hover:bg-border"
        title={expandLabel}
        aria-label={expandLabel}
      >
        {allRowsExpanded ? (
          <FoldVertical className="h-3 w-3" />
        ) : (
          <UnfoldVertical className="h-3 w-3" />
        )}
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        type="button"
        onClick={(event) => {
          setIsCopied(true);
          onCopy(event);
          setTimeout(() => setIsCopied(false), 1000);
        }}
        className="hover:bg-border"
        title="Copy to clipboard"
        aria-label="Copy to clipboard"
      >
        {isCopied ? (
          <Check className="h-3 w-3" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </Button>
    </div>
  );
}

/** One radio group of the debug menu: every style direction for `dataClass`. */
function JsonTableStyleRadioGroup({
  dataClass,
  value,
}: {
  dataClass: JsonTableDataClass;
  value: JsonTableStyleVariant;
}) {
  return (
    <>
      <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
        {JSON_TABLE_DATA_CLASS_LABELS[dataClass]}
      </DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={value}
        onValueChange={(next) =>
          writeStoredJsonTableStyleVariant(
            dataClass,
            next as JsonTableStyleVariant,
          )
        }
      >
        {JSON_TABLE_STYLE_VARIANTS.map((variant) => (
          <DropdownMenuRadioItem key={variant} value={variant}>
            {JSON_TABLE_STYLES[variant].label}
            <span className="text-muted-foreground ml-1">
              {JSON_TABLE_STYLES[variant].reference}
            </span>
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  );
}

/** Debug-only menu for the three finalist directions: one "Style" radio
    group (applies to both classes) and one "Auto (Table or Tree by content)"
    switch that puts IO tables on the tree direction with the class derived
    from the data. The full twelve-direction menu is behind localStorage
    `lf-json-style-all`. */
function JsonTableStyleFinalistMenuContent({
  active,
}: {
  /** Variant the table that opened the menu renders right now. */
  active: JsonTableStyleVariant;
}) {
  const factsStored = useStoredJsonTableStyleVariant("facts");
  const ioStored = useStoredJsonTableStyleVariant("io");
  const classMode = useJsonTableClassMode();
  const style = factsStored ?? DEFAULT_JSON_TABLE_STYLE_VARIANT;
  const auto =
    classMode === "shape" && ioStored === LONG_CONTENT_JSON_TABLE_STYLE_VARIANT;
  const hasStoredPick = useHasStoredJsonTableStylePick();
  return (
    <>
      <DropdownMenuLabel>
        JSON table style (debug)
        <span className="text-muted-foreground ml-1 font-normal">
          this table: {JSON_TABLE_STYLES[active].label}
        </span>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
        Style
      </DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={style}
        onValueChange={(next) =>
          writeStoredJsonTableStylePick(next as JsonTableStyleVariant, auto)
        }
      >
        {FINALIST_JSON_TABLE_STYLE_VARIANTS.map((variant) => (
          <DropdownMenuRadioItem key={variant} value={variant}>
            <span className="flex flex-col gap-0.5">
              <span>{JSON_TABLE_STYLES[variant].label}</span>
              <span className="text-muted-foreground text-xs">
                {JSON_TABLE_STYLES[variant].reference}
              </span>
            </span>
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator />
      <DropdownMenuCheckboxItem
        checked={auto}
        onCheckedChange={(checked) =>
          writeStoredJsonTableStylePick(style, checked === true)
        }
      >
        <span className="flex flex-col gap-0.5">
          <span>Auto (Table or Tree by content)</span>
          <span className="text-muted-foreground text-xs">
            Fact sheets (flat, short values) keep the style above; content
            (lists, long text, deep nesting) uses Tree
          </span>
        </span>
      </DropdownMenuCheckboxItem>
      {hasStoredPick && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => clearStoredJsonTableStyleVariants()}
          >
            Reset to default
          </DropdownMenuItem>
        </>
      )}
    </>
  );
}

/** Debug-only menu for every table style direction (`lf-json-style-all`).
    Facts and IO tables each store their own pick in localStorage so the two
    classes can be compared live in one panel; the pick applies app-wide and
    survives reloads. "Class by" switches between the caller's class (field)
    and one derived from the data (shape). */
function JsonTableStyleMenuContent({
  dataClass,
  fieldDataClass,
  classMode,
  active,
}: {
  /** Class of the table that opened the menu, after the class mode. */
  dataClass: JsonTableDataClass;
  /** Class the caller passed for that table. */
  fieldDataClass: JsonTableDataClass;
  classMode: JsonTableClassMode;
  /** Variant that table renders right now. */
  active: JsonTableStyleVariant;
}) {
  const otherClass: JsonTableDataClass = dataClass === "facts" ? "io" : "facts";
  const otherStored = useStoredJsonTableStyleVariant(otherClass);
  const otherActive = otherStored ?? DEFAULT_JSON_TABLE_STYLE_VARIANT;
  const hasStoredPick = useHasStoredJsonTableStylePick();
  const valueFor = (group: JsonTableDataClass) =>
    group === dataClass ? active : otherActive;
  return (
    <>
      <DropdownMenuLabel>
        JSON table style (debug)
        <span className="text-muted-foreground ml-1 font-normal">
          this table: {dataClass} (by {classMode}
          {dataClass !== fieldDataClass ? `, ${fieldDataClass} by field` : ""})
        </span>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
        Class by
      </DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={classMode}
        onValueChange={(next) =>
          writeStoredJsonTableClassMode(next as JsonTableClassMode)
        }
      >
        {JSON_TABLE_CLASS_MODES.map((mode) => (
          <DropdownMenuRadioItem key={mode} value={mode}>
            {JSON_TABLE_CLASS_MODE_LABELS[mode].label}
            <span className="text-muted-foreground ml-1">
              {JSON_TABLE_CLASS_MODE_LABELS[mode].reference}
            </span>
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
      {JSON_TABLE_DATA_CLASSES.map((group) => (
        <Fragment key={group}>
          <DropdownMenuSeparator />
          <JsonTableStyleRadioGroup dataClass={group} value={valueFor(group)} />
        </Fragment>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        disabled={active === otherActive}
        onSelect={() => writeStoredJsonTableStyleVariant(otherClass, active)}
      >
        Same for both
        <span className="text-muted-foreground ml-1">
          {JSON_TABLE_STYLES[active].label} for {otherClass} too
        </span>
      </DropdownMenuItem>
      {hasStoredPick && (
        <DropdownMenuItem onSelect={() => clearStoredJsonTableStyleVariants()}>
          Reset to default
        </DropdownMenuItem>
      )}
    </>
  );
}

/** True once any debug pick is stored (either class, the legacy key, or the
    class mode). */
function useHasStoredJsonTableStylePick(): boolean {
  const facts = useStoredJsonTableStyleVariant("facts");
  const io = useStoredJsonTableStyleVariant("io");
  const classMode = useStoredJsonTableClassMode();
  return facts !== null || io !== null || classMode !== null;
}

export function PrettyJsonView(props: {
  json?: unknown;
  parsedJson?: unknown; // Pre-parsed data (optional, from useParsedObservation hook)
  title?: string;
  titleIcon?: React.ReactNode;
  className?: string;
  isLoading?: boolean;
  isParsing?: boolean;
  codeClassName?: string;
  collapseStringsAfterLength?: number | null;
  media?: MediaReturnType[];
  scrollable?: boolean;
  controlButtons?: React.ReactNode;
  currentView?: "pretty" | "json";
  externalExpansionState?: Record<string, boolean> | boolean;
  onExternalExpansionChange?: (
    expansion: Record<string, boolean> | boolean,
  ) => void;
  showNullValues?: boolean;
  stickyTopLevelKey?: boolean;
  showObservationTypeBadge?: boolean;
  tone?: PrettyJsonViewTone;
  inset?: boolean;
  /** Hide the Path / Value header row of the table view. Defaults to the
      active style direction (hidden under a title for all but `current`);
      pass `false` to opt back in. */
  hideHeader?: boolean;
  /** What the table shows: facts (metadata, attributes, model parameters)
      or IO (input, output, messages, tool calls). Each class has its own
      stored debug pick; defaults to facts. Ignored while the stored class
      mode is "shape" (`classifyJsonShape` decides from the data). */
  dataClass?: JsonTableDataClass;
  /** Table style direction. A stored debug pick for `dataClass` (localStorage
      `lf-json-style-facts` / `lf-json-style-io`, or the legacy `lf-json-style`)
      overrides this unless `lockStyleVariant` is set; see
      jsonTableStyleVariants.ts. */
  styleVariant?: JsonTableStyleVariant;
  /** Render exactly `styleVariant`, ignoring the stored debug pick, and hide
      the picker (review page). */
  lockStyleVariant?: boolean;
  /** Content to render between header and main content (e.g., thinking blocks) */
  afterHeader?: React.ReactNode;
  /** When set, rows show an actions menu with copy + add-to-filter shortcuts
      (metadata views only). */
  metadataActions?: MetadataFilterActions;
  /** Collapse long string content to a preview (from raw `role === "system"`,
      since the title can carry a message `name` instead of the role). */
  isSystemPrompt?: boolean;
}) {
  const toneClasses = props.tone
    ? PRETTY_JSON_VIEW_TONE_CLASSES[props.tone]
    : undefined;
  const codeClassName = cn(props.codeClassName, toneClasses?.container);
  // Large plain-string gate (LFE-10991): a multi-MB top-level string skips
  // deepParseJson's object-only `maxSize` guard, so without this it would run
  // several full-length main-thread passes (parse, the markdown-probe
  // `JSON.stringify`, unicode decode — some of them twice, including inside the
  // always-mounted hidden JSON viewer) and mount the unvirtualized react18-json
  // tree with the whole string, blocking the tab and inflating memory. The body
  // renders a bounded preview + download instead.
  //
  // Gate on the SETTLED value only. During an async worker parse the parsed
  // value is not ready (`parsedJson === undefined`, `isParsing` true) and the
  // raw `json` may be a *stringified* payload whose JSON-quoted form is itself
  // >2M chars (e.g. the JSON tab passes raw `json` alongside a not-yet-ready
  // `parsedJson`). Gating on that raw form would flash the fallback — and offer
  // a quoted-form download — before the parse settles to the real value. The
  // unvirtualized render we protect against does not run during parse anyway,
  // so fall through to the normal loading/parsing state in that window.
  const largeStringValue = useMemo(() => {
    if (props.isParsing) return null;
    const settled =
      props.parsedJson !== undefined ? props.parsedJson : props.json;
    return isLargeRenderString(settled) ? settled : null;
  }, [props.parsedJson, props.json, props.isParsing]);

  // Use pre-parsed data if available, otherwise parse on-demand
  const parsedJson = useMemo(() => {
    // Skip all parse/decode work on very large plain strings (see gate above);
    // the raw string is rendered through the bounded fallback, not decoded.
    if (largeStringValue !== null) {
      return largeStringValue;
    }

    // If pre-parsed data is provided, use it directly (skip parsing)
    if (props.parsedJson !== undefined) {
      return decodeUnicodeInJson(props.parsedJson);
    }

    // If still parsing in Web Worker, return null (will show loading state)
    if (props.isParsing) {
      return null;
    }

    // Fast path: if already an object, likely no parsing needed
    if (typeof props.json !== "string") {
      return decodeUnicodeInJson(props.json);
    }

    // Only parse strings, with size/depth limits
    const result = deepParseJson(props.json, {
      maxSize: 500_000,
      maxDepth: 2,
    });

    // Decode \uXXXX escapes so Python SDK (ensure_ascii=True) traces display
    // non-ASCII characters correctly in the trace detail view.
    return decodeUnicodeInJson(result);
  }, [props.json, props.parsedJson, props.isParsing, largeStringValue]);

  // Data class: the caller's by default (by field); in shape mode the parsed
  // value decides, so a flat output reads as facts and a chat input as IO.
  const fieldDataClass = props.dataClass ?? DEFAULT_JSON_TABLE_DATA_CLASS;
  const classMode = useJsonTableClassMode();
  const dataClass = useMemo(
    () =>
      classMode === "shape" ? classifyJsonShape(parsedJson) : fieldDataClass,
    [classMode, parsedJson, fieldDataClass],
  );
  const resolvedStyleVariant = useJsonTableStyleVariant(
    dataClass,
    props.styleVariant,
  );
  // Caller lock (review pages) > style pinned by the app-wide view toggle >
  // stored debug pick > caller prop > default. A pinned style also locks the
  // table: the picker's picks are not consulted and it is hidden.
  const pinnedStyleVariant = usePinnedJsonTableStyleVariant();
  const styleVariant = props.lockStyleVariant
    ? (props.styleVariant ?? DEFAULT_JSON_TABLE_STYLE_VARIANT)
    : (pinnedStyleVariant ?? resolvedStyleVariant);
  const styleVariantLocked =
    Boolean(props.lockStyleVariant) || pinnedStyleVariant !== null;
  const tableStyle = JSON_TABLE_STYLES[styleVariant];
  const tableHasContentSizedKeys =
    tableStyle.layout === "columns" && tableStyle.keyColumn === "content";
  const showStylePicker = useShowJsonTableStylePicker() && !styleVariantLocked;
  const showAllStyles = useShowAllJsonTableStyles();
  const hasTitle = Boolean(props.title);
  // Untitled tables have no section header to hang copy and expand all on,
  // so styles that drop the Path / Value row there get them as hover-revealed
  // controls anchored to the table instead.
  const untitledHeaderDropped = !hasTitle && !tableStyle.headerWhenUntitled;
  // Title-owned tables drop the Path / Value header and the outer box (the
  // section title is the frame) unless the style keeps them. Single-column
  // layouts never show the header. Toned containers keep their tinted border.
  const hideTableHeader =
    props.hideHeader ??
    (tableStyle.layout !== "columns" ||
      (hasTitle && !tableStyle.headerUnderTitle) ||
      untitledHeaderDropped);
  const tableBorderless = hasTitle && !tableStyle.boxUnderTitle && !props.tone;

  // JSONView internally calls deepParseJson (with maxDepth:3) which mutates
  // nested string fields in place. Because baseTableData[].rawChildData holds
  // references back into parsedJson, sharing parsedJson with JSONView would
  // corrupt the table's lazy-loaded children whenever JSONView renders (even
  // while hidden via display:none). Pass a deep clone so the two views stay
  // independent.
  const jsonViewInput = useMemo(() => {
    if (parsedJson === null || parsedJson === undefined) return props.json;
    if (typeof parsedJson !== "object") return parsedJson;
    return structuredClone(parsedJson);
  }, [parsedJson, props.json]);

  const actualCurrentView = props.currentView ?? "pretty";
  const expandAllRef = useRef<(() => void) | null>(null);
  const [allRowsExpanded, setAllRowsExpanded] = useState(false);

  // For JSON view: derive collapsed state from external expansion state
  // false or empty object = collapsed, true or object with keys = expanded
  const deriveJsonCollapsedFromExternal = useCallback(
    (extState: Record<string, boolean> | boolean | undefined): boolean => {
      if (extState === undefined) return false; // default: not collapsed
      if (extState === false) return true; // explicitly collapsed
      if (extState === true) return false; // explicitly expanded
      // empty object = collapsed (user collapsed all)
      if (typeof extState === "object" && Object.keys(extState).length === 0)
        return true;
      return false; // has keys = not collapsed
    },
    [],
  );

  const [jsonIsCollapsed, setJsonIsCollapsed] = useState(() =>
    deriveJsonCollapsedFromExternal(props.externalExpansionState),
  );

  // Sync jsonIsCollapsed when external state changes (e.g., navigating between observations)
  const prevExternalStateRef = useRef(props.externalExpansionState);
  useEffect(() => {
    if (prevExternalStateRef.current !== props.externalExpansionState) {
      const newCollapsed = deriveJsonCollapsedFromExternal(
        props.externalExpansionState,
      );
      prevExternalStateRef.current = props.externalExpansionState;
      setJsonIsCollapsed(newCollapsed);
    }
  }, [props.externalExpansionState, deriveJsonCollapsedFromExternal]);
  const [expandedRowsWithChildren, setExpandedRowsWithChildren] = useState<
    Set<string>
  >(new Set());
  const [expandedCells, setExpandedCells] = useState<Set<string>>(new Set());
  const [, setForceUpdate] = useState(0);

  // View's own state, lower precedence than optionally supplied external expansion state
  const [internalExpansionState, setInternalExpansionState] =
    useState<LangfuseExpandedState>({});

  const isChatML = useMemo(() => isChatMLFormat(parsedJson), [parsedJson]);
  const characterLimit = useMarkdownRenderCharacterLimit();
  const { isMarkdown, content: markdownContent } = useMemo(
    // Skip the markdown probe for gated large strings: isMarkdownContent runs
    // `JSON.stringify` on the whole value, an O(n) pass over the multi-MB string.
    () =>
      largeStringValue !== null
        ? { isMarkdown: false as const, content: undefined }
        : isMarkdownContent(parsedJson, characterLimit),
    [parsedJson, largeStringValue, characterLimit],
  );

  // Nested MarkdownView is rendered without a title (this view owns the
  // header), so the header must host the same collapse control that
  // MarkdownView would show when it has a title. Skip gated large strings:
  // they render through LargeStringFallback, and splitting them for a
  // preview would undo the main-thread guard that gate exists for.
  const systemPromptCollapsibleContent =
    largeStringValue !== null
      ? ""
      : typeof markdownContent === "string"
        ? markdownContent
        : typeof parsedJson === "string"
          ? parsedJson
          : "";
  const {
    shouldBeCollapsible: shouldCollapseSystemPrompt,
    isCollapsed: isSystemPromptCollapsed,
    toggleCollapsed: toggleSystemPromptCollapsed,
  } = useCollapsibleSystemPrompt({
    isSystemPrompt: Boolean(props.isSystemPrompt),
    content: systemPromptCollapsibleContent,
  });

  const baseTableData = useMemo(() => {
    try {
      if (
        largeStringValue === null &&
        actualCurrentView === "pretty" &&
        parsedJson !== null &&
        parsedJson !== undefined &&
        !isChatML &&
        !isMarkdown
      ) {
        // early abort check for smart expansion
        if (parsedJson?.constructor === Object) {
          const topLevelKeys = Object.keys(
            parsedJson as Record<string, unknown>,
          );
          if (topLevelKeys.length > DEFAULT_MAX_ROWS_IF_ROOT) {
            // return empty array to skip expansion directly
            return [];
          }
        }

        // lazy load JSON data, generate only top-level rows initially; children on expand
        const createTopLevelRows = (
          obj: Record<string, unknown>,
        ): JsonTableRow[] => {
          const entries = Object.entries(obj);
          const rows: JsonTableRow[] = [];

          entries.forEach(([key, value]) => {
            const valueType = getValueType(value);
            const childrenExist = hasChildren(value, valueType);

            const row: JsonTableRow = {
              id: key,
              key,
              value,
              type: valueType,
              hasChildren: childrenExist,
              level: 0,
              childrenGenerated: false,
            };

            if (childrenExist) {
              row.rawChildData = value;
              row.subRows = []; // empty initially for lazy loading
            }
            rows.push(row);
          });
          return rows;
        };

        let result: JsonTableRow[];

        // top-level is an object, start with its properties directly
        if (parsedJson?.constructor === Object) {
          result = createTopLevelRows(parsedJson as Record<string, unknown>);
        } else {
          result = transformJsonToTableData(parsedJson, "", 0, "", true);
        }

        return result;
      }

      return [];
    } catch (error) {
      console.error("Error transforming JSON to table data:", error);
      return [];
    }
  }, [parsedJson, isChatML, isMarkdown, actualCurrentView, largeStringValue]);

  // state precedence: external state before smart expansion
  const finalExpansionState: ExpandedState = useMemo(() => {
    if (baseTableData.length === 0) return {};

    if (props.externalExpansionState === false) {
      // user collapsed all
      return {};
    }
    if (props.externalExpansionState === true) {
      // user expanded all
      return true;
    }
    if (
      typeof props.externalExpansionState === "object" &&
      props.externalExpansionState !== null &&
      Object.keys(props.externalExpansionState).length > 0
    ) {
      // user set specific expansions - apply with prefix matching

      // Extract expanded paths for prefix matching
      const expandedPaths = Object.entries(props.externalExpansionState)
        .filter(([, isExpanded]) => isExpanded)
        .map(([path]) => path);

      // Apply prefix matching: for each expanded path, expand all its ancestors
      // Example: if "messages.0.content.text" is expanded, also expand:
      // "messages", "messages.0", "messages.0.content"
      const enhancedState: Record<string, boolean> = {
        ...props.externalExpansionState,
      };

      expandedPaths.forEach((path) => {
        const parts = path.split(".");
        // Generate all ancestor paths
        for (let i = 1; i < parts.length; i++) {
          const ancestorPath = parts.slice(0, i).join(".");
          if (enhancedState[ancestorPath] === undefined) {
            enhancedState[ancestorPath] = true;
          }
        }
      });

      return enhancedState;
    }

    // No external state -> use smart expansion. Short primitive lists stay
    // collapsed because the parent-row preview already shows their contents.
    return getSmartExpansionState(baseTableData, DEFAULT_MAX_ROWS);
  }, [baseTableData, props.externalExpansionState]);

  // actual expansion state used by the table (combines initial + user changes)
  const actualExpansionState = useMemo(() => {
    if (finalExpansionState === true) return true;

    // Ensure both states are objects with fallback
    const finalState = (finalExpansionState as Record<string, boolean>) || {};
    const internalState =
      (internalExpansionState as Record<string, boolean>) || {};

    // Smart expansion only applies on initial load (when no user interactions yet)
    if (Object.keys(internalState).length > 0) {
      // user made changes, use them
      return internalState;
    } else if (internalExpansionState === false) {
      // user collapsed all
      return false;
    }
    return finalState;
  }, [finalExpansionState, internalExpansionState]);

  // table data with lazy-loaded children
  const tableData = useMemo(() => {
    const updateRowWithChildren = (rows: JsonTableRow[]): JsonTableRow[] => {
      return rows.map((row) => {
        let updatedRow = row;

        // Generate children if:
        // 1. Row is in expandedRowsWithChildren (user clicked lazy loading), OR
        // 2. Row should be expanded according to actualExpansionState (smart expansion)
        const keyPath = convertRowIdToKeyPath(row.id);
        const shouldHaveChildren =
          expandedRowsWithChildren.has(row.id) ||
          (actualExpansionState !== true &&
            actualExpansionState &&
            actualExpansionState[keyPath]);

        if (shouldHaveChildren && row.rawChildData && !row.childrenGenerated) {
          const children = generateChildRows(row);
          updatedRow = {
            ...row,
            subRows: children,
            childrenGenerated: true,
          };
        }

        if (updatedRow.subRows && updatedRow.subRows.length > 0) {
          updatedRow = {
            ...updatedRow,
            subRows: updateRowWithChildren(updatedRow.subRows),
          };
        }

        return updatedRow;
      });
    };

    const dataWithChildren = updateRowWithChildren(baseTableData);
    return filterTableRows(dataWithChildren, props.showNullValues ?? true);
  }, [
    baseTableData,
    expandedRowsWithChildren,
    actualExpansionState,
    props.showNullValues,
  ]);

  const handleLazyLoadChildren = useCallback((rowId: string) => {
    setExpandedRowsWithChildren((prev) => {
      const newSet = new Set(prev);
      // we track the IDs for batch updates when lazy loading children
      if (rowId.includes(",")) {
        rowId.split(",").forEach((id) => newSet.add(id));
      } else {
        newSet.add(rowId);
      }

      return newSet;
    });
  }, []);

  const handleForceUpdate = useCallback(() => {
    setForceUpdate((prev) => prev + 1);
  }, []);

  const toggleCellExpansion = useCallback((cellId: string) => {
    setExpandedCells((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(cellId)) {
        newSet.delete(cellId);
      } else {
        newSet.add(cellId);
      }
      return newSet;
    });
  }, []);

  const { onExternalExpansionChange } = props;
  const handleTableExpandedChange = useCallback(
    (
      updater:
        | ExpandedState
        | ((prev: ExpandedState) => ExpandedState)
        | boolean,
    ) => {
      // always update internal state of the table
      let newState: ExpandedState;
      if (typeof updater === "function") {
        newState = updater(
          actualExpansionState === false ? {} : actualExpansionState,
        );
        const finalState: LangfuseExpandedState =
          typeof newState === "object" && Object.keys(newState).length === 0
            ? false
            : newState;
        setInternalExpansionState(finalState);

        // update external state if state changed by user (callback provided)
        if (onExternalExpansionChange) {
          if (typeof newState === "boolean") {
            onExternalExpansionChange(newState);
            return;
          }

          const keyBasedState = Object.fromEntries(
            Object.entries(newState).filter(([, expanded]) => expanded),
          );

          // user collapsed all items -> set state to false (instead of empty object)
          const finalExternalState =
            Object.keys(keyBasedState).length === 0 ? false : keyBasedState;
          onExternalExpansionChange(finalExternalState);
        }
      } else if (typeof updater !== "boolean") {
        newState = updater;
        const finalState: LangfuseExpandedState =
          typeof newState === "object" && Object.keys(newState).length === 0
            ? false
            : newState;
        setInternalExpansionState(finalState);

        // Handle external state updates for expand/collapse all button
        if (onExternalExpansionChange && typeof newState === "object") {
          if (Object.keys(newState).length === 0) {
            // user collapsed all
            onExternalExpansionChange(false);
          } else {
            onExternalExpansionChange(newState);
          }
        }
      }
    },
    [onExternalExpansionChange, actualExpansionState],
  );

  const handleOnCopy = (event?: React.MouseEvent<HTMLButtonElement>) => {
    if (event) {
      event.preventDefault();
    }
    const textToCopy = stringifyJsonNode(parsedJson);
    copyTextToClipboard(textToCopy);

    if (event) {
      event.currentTarget.focus();
    }
  };

  const handleJsonToggleCollapse = () => {
    const newCollapsed = !jsonIsCollapsed;
    setJsonIsCollapsed(newCollapsed);
    if (props.onExternalExpansionChange) {
      props.onExternalExpansionChange(!newCollapsed);
    }
  };

  const emptyValueDisplay = getEmptyValueDisplay(parsedJson);
  const isPrettyView = actualCurrentView === "pretty";
  const isMarkdownMode = isMarkdown && isPrettyView;
  const standaloneMediaReferenceStrings =
    typeof markdownContent === "string"
      ? getStandaloneMediaReferenceStrings(markdownContent)
      : [];
  const shouldRenderStandaloneMedia =
    isMarkdownMode && standaloneMediaReferenceStrings.length > 0;
  const remainingMarkdownMedia = filterAlreadyRenderedMedia(
    props.media,
    getRenderedInlineMediaIds({
      markdown: markdownContent ?? "",
    }),
  );
  const shouldUseTableView =
    largeStringValue === null &&
    isPrettyView &&
    !isChatML &&
    !isMarkdown &&
    !emptyValueDisplay;
  // The table is the only frame left: neither header can carry the controls.
  const showTableHoverControls =
    shouldUseTableView && untitledHeaderDropped && hideTableHeader;

  const getBackgroundColorClass = () =>
    cn(
      ASSISTANT_TITLES.includes(props.title || "")
        ? "bg-accent-light-green"
        : "",
      SYSTEM_TITLES.includes(props.title || "") ? "bg-card" : "",
    );

  const body = (
    <>
      {largeStringValue !== null ? (
        <LargeStringFallback title={props.title} value={largeStringValue} />
      ) : props.isLoading || props.isParsing ? (
        <div className="io-message-content ph-no-capture">
          <div
            className={cn(
              getContainerClasses(props.title, props.scrollable, codeClassName),
            )}
          >
            <div className="space-y-2 p-3">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-3 w-2/3" />
              {props.isParsing && (
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
              getContainerClasses(props.title, props.scrollable, codeClassName),
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
              media={props.media}
              isSystemPrompt={props.isSystemPrompt}
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
                  props.title,
                  props.scrollable,
                  codeClassName,
                  "flex text-xs wrap-break-word whitespace-pre-wrap",
                  tableBorderless,
                ),
                // Container for the key column's 40cqw cap. Inline-size
                // containment zeroes this flex item's intrinsic width, so it
                // takes the row width explicitly.
                tableHasContentSizedKeys && "@container w-full",
                showTableHoverControls && "group/json-table relative",
              )}
            >
              {showTableHoverControls ? (
                <JsonTableHoverControls
                  allRowsExpanded={allRowsExpanded}
                  onToggleExpandAll={() => expandAllRef.current?.()}
                  onCopy={handleOnCopy}
                />
              ) : null}
              {props.isLoading ? (
                <Skeleton className="m-3 h-3 w-3/4" />
              ) : (
                <JsonPrettyTable
                  data={tableData}
                  expandAllRef={expandAllRef}
                  onExpandStateChange={setAllRowsExpanded}
                  noBorder={true}
                  hideHeader={hideTableHeader}
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
                  metadataActions={props.metadataActions}
                  toneClasses={toneClasses}
                  style={tableStyle}
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
              title={props.title} // Title value used for background styling
              hideTitle={true} // But hide the title, we display it
              className=""
              isLoading={props.isLoading}
              codeClassName={codeClassName}
              collapseStringsAfterLength={props.collapseStringsAfterLength}
              media={props.media}
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
      {props.media &&
        props.media.length > 0 &&
        isPrettyView &&
        !isMarkdownMode && (
          <>
            <div className="text-muted-foreground my-1 px-2 py-1 text-xs">
              Media
            </div>
            <div className="ph-no-capture flex flex-wrap gap-2 px-2 pt-1 pb-4">
              {props.media.map((m) => (
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

  return (
    <div
      className={cn(
        "flex max-h-full min-h-0 flex-col",
        props.inset && "[&_.io-message-content]:px-2",
        props.className,
        props.scrollable ? "overflow-hidden" : "",
      )}
    >
      {props.title ? (
        <MarkdownJsonViewHeader
          title={
            tableStyle.titleCount &&
            shouldUseTableView &&
            tableData.length > 0 ? (
              <>
                {props.title}
                <span className="text-muted-foreground text-xs font-normal normal-case">
                  {tableData.length}{" "}
                  {Array.isArray(parsedJson)
                    ? tableData.length === 1
                      ? "item"
                      : "items"
                    : tableData.length === 1
                      ? "key"
                      : "keys"}
                </span>
              </>
            ) : (
              props.title
            )
          }
          titleIcon={props.titleIcon}
          canEnableMarkdown={false}
          handleOnValueChange={() => {}} // No-op, parent handles state
          handleOnCopy={handleOnCopy}
          collapseControl={
            shouldCollapseSystemPrompt &&
            isMarkdownMode &&
            !shouldRenderStandaloneMedia
              ? {
                  isCollapsed: isSystemPromptCollapsed,
                  onToggle: () => toggleSystemPromptCollapsed("header"),
                }
              : undefined
          }
          inset={props.inset}
          controlButtons={
            <>
              {shouldUseTableView && showStylePicker && (
                <DropdownMenuController
                  align="end"
                  maxWidth={showAllStyles ? undefined : 360}
                  maxHeight="var(--radix-dropdown-menu-content-available-height)"
                  renderMenu={() =>
                    showAllStyles ? (
                      <JsonTableStyleMenuContent
                        dataClass={dataClass}
                        fieldDataClass={fieldDataClass}
                        classMode={classMode}
                        active={styleVariant}
                      />
                    ) : (
                      <JsonTableStyleFinalistMenuContent
                        active={styleVariant}
                      />
                    )
                  }
                >
                  {({ Trigger }) => (
                    <Trigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="hover:bg-border -mr-2"
                        title={`JSON table style (${dataClass} by ${classMode}): ${JSON_TABLE_STYLES[styleVariant].label}`}
                        aria-label="JSON table style"
                      >
                        <Palette className="h-3 w-3" />
                      </Button>
                    </Trigger>
                  )}
                </DropdownMenuController>
              )}
              {shouldUseTableView && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => expandAllRef.current?.()}
                  className="hover:bg-border -mr-2"
                  title={
                    allRowsExpanded ? "Collapse all rows" : "Expand all rows"
                  }
                >
                  {allRowsExpanded ? (
                    <FoldVertical className="h-3 w-3" />
                  ) : (
                    <UnfoldVertical className="h-3 w-3" />
                  )}
                </Button>
              )}
              {!shouldUseTableView && !isMarkdownMode && !largeStringValue && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={handleJsonToggleCollapse}
                  className="hover:bg-border -mr-2"
                  title={jsonIsCollapsed ? "Expand all" : "Collapse all"}
                >
                  {jsonIsCollapsed ? (
                    <UnfoldVertical className="h-3 w-3" />
                  ) : (
                    <FoldVertical className="h-3 w-3" />
                  )}
                </Button>
              )}
              {props.controlButtons}
            </>
          }
        />
      ) : null}
      {props.afterHeader}
      {props.scrollable ? (
        <div
          className={cn(
            "flex h-full min-h-0 overflow-hidden",
            isMarkdownMode
              ? getBackgroundColorClass()
              : shouldUseTableView && tableBorderless
                ? ""
                : "rounded-sm border",
          )}
        >
          <div className="max-h-full min-h-0 w-full overflow-y-auto">
            {body}
          </div>
        </div>
      ) : isMarkdownMode ? (
        <div className={getBackgroundColorClass()}>{body}</div>
      ) : (
        body
      )}
    </div>
  );
}

// TODO: deduplicate with CodeJsonViewer.tsx
function stringifyJsonNode(node: unknown) {
  // return single string nodes without quotes
  if (typeof node === "string") {
    return node;
  }

  try {
    return JSON.stringify(
      node,
      (key, value) => {
        switch (typeof value) {
          case "bigint":
            return String(value) + "n";
          case "number":
          case "boolean":
          case "object":
          case "string":
            return value as string;
          default:
            return String(value);
        }
      },
      4,
    );
  } catch (error) {
    console.error("JSON stringify error", error);
    return "Error: JSON.stringify failed";
  }
}
