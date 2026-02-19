import { useMemo, useState, useEffect, useRef, useCallback, memo } from "react";
import { cn } from "@/src/utils/tailwind";
import { deepParseJson } from "@langfuse/shared";
import { Skeleton } from "@/src/components/ui/skeleton";
import { type MediaReturnType } from "@/src/features/media/validation";
import { LangfuseMediaView } from "@/src/components/ui/LangfuseMediaView";
import { MarkdownJsonViewHeader } from "@/src/components/ui/MarkdownJsonView";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { Button } from "@/src/components/ui/button";
import { useClickWithoutSelection } from "@/src/hooks/useClickWithoutSelection";
import {
  ChevronDown,
  ChevronRight,
  UnfoldVertical,
  FoldVertical,
} from "lucide-react";
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
  StringOrMarkdownSchema,
  containsAnyMarkdown,
} from "@/src/components/schemas/MarkdownSchema";
import { MARKDOWN_RENDER_CHARACTER_LIMIT } from "@/src/utils/constants";
import {
  convertRowIdToKeyPath,
  getRowChildren,
  type JsonTableRow,
  transformJsonToTableData,
} from "@/src/components/table/utils/jsonExpansionUtils";
import {
  ValueCell,
  getValueStringLength,
} from "@/src/components/table/ValueCell";
import { ItemBadge, type LangfuseItemType } from "@/src/components/ItemBadge";

// Constants for table layout
const INDENTATION_PER_LEVEL = 16;
const INDENTATION_BASE = 8;
const BUTTON_WIDTH = 16;
const MARGIN_LEFT_1 = 4;
const CELL_PADDING_X = 8; // px-2

// Constants for smart expansion logic
// Used for nested objects to control smart expansion depth
const DEFAULT_MAX_ROWS = 20;
// Used for root-level objects where user has no parent to expand from. Therefore,
// set higher to ensure objects like metadata with many keys are still displayed
const DEFAULT_MAX_ROWS_IF_ROOT = 100;
const DEEPEST_DEFAULT_EXPANSION_LEVEL = 10;

const MAX_CELL_DISPLAY_CHARS = 2000;

const ASSISTANT_TITLES = ["assistant", "Output", "model"];
const SYSTEM_TITLES = ["system", "Input"];

const MONO_TEXT_CLASSES = "font-mono text-xs break-words";
const PREVIEW_TEXT_CLASSES = "italic text-gray-500 dark:text-gray-400";

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
  baseClasses = "whitespace-pre-wrap break-words p-3 text-xs",
) {
  return cn(
    baseClasses,
    ASSISTANT_TITLES.includes(title || "")
      ? "bg-accent-light-green dark:border-accent-dark-green"
      : "",
    SYSTEM_TITLES.includes(title || "") ? "bg-primary-foreground" : "",
    scrollable ? "" : "rounded-sm border",
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

function isMarkdownContent(json: unknown): {
  isMarkdown: boolean;
  content?: string;
} {
  const contentSize = JSON.stringify(json || {}).length;
  if (contentSize > MARKDOWN_RENDER_CHARACTER_LIMIT) {
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

function findOptimalExpansionLevel(
  data: JsonTableRow[],
  maxRows: number,
): number {
  if (data.length > maxRows) {
    return 0;
  }

  function findOptimalRecursively(
    rows: JsonTableRow[],
    currentLevel: number,
    cumulativeCount: number,
    visitedData = new WeakSet(),
  ): number {
    const rowsAtThisLevel = rows.length;
    const newCumulativeCount = cumulativeCount + rowsAtThisLevel;

    // If expanding to this level exceeds maxRows, return previous level
    if (newCumulativeCount > maxRows) {
      return currentLevel - 1;
    }

    if (currentLevel >= DEEPEST_DEFAULT_EXPANSION_LEVEL) {
      return currentLevel;
    }

    // Get all children for next level
    let childRows: JsonTableRow[] = [];

    for (const row of rows) {
      if (row.hasChildren && row.rawChildData) {
        if (typeof row.rawChildData !== "object" || row.rawChildData === null) {
          continue; // Skip non-objects
        }

        // Skip if we've already processed this exact data to prevent cycles
        if (visitedData.has(row.rawChildData)) {
          continue;
        }

        // Mark data as visited
        visitedData.add(row.rawChildData);

        const children = getRowChildren(row);
        // Use concat instead of spread to avoid stack overflow with large arrays
        childRows = childRows.concat(children);
      }
    }

    if (childRows.length === 0) {
      return currentLevel;
    }

    return findOptimalRecursively(
      childRows,
      currentLevel + 1,
      newCumulativeCount,
      visitedData,
    );
  }

  return Math.max(0, findOptimalRecursively(data, 0, 0));
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
          row.original.level === 0 && stickyTopLevelKey
            ? "sticky z-10 bg-background shadow-sm"
            : "",
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
            className="whitespace-normal px-2 py-1 align-top"
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
  expanded,
  onExpandedChange,
  onLazyLoadChildren,
  onForceUpdate,
  smartDefaultsLevel,
  expandedCells,
  toggleCellExpansion,
  stickyTopLevelKey = false,
  showObservationTypeBadge = false,
}: {
  data: JsonTableRow[];
  expandAllRef?: React.MutableRefObject<(() => void) | null>;
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
}) {
  const headerRef = useRef<HTMLTableRowElement>(null);
  const topLevelRowRef = useRef<HTMLTableRowElement>(null);
  const [stickyOffsets, setStickyOffsets] = useState({ header: 32, row: 32 });

  // calculate height of top row to calculate offsets for other headings to not go beneath sticky rows
  useEffect(() => {
    if (stickyTopLevelKey && headerRef.current) {
      const headerHeight = headerRef.current.offsetHeight;

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
  }, [stickyTopLevelKey, data, expanded]);

  const columns: LangfuseColumnDef<JsonTableRow, unknown>[] = [
    {
      accessorKey: "key",
      header: "Path",
      size: 35,
      cell: ({ row }) => {
        // we need to calculate the indentation here for a good line break
        // because of the padding, we don't know when to break the line otherwise
        const indentationWidth =
          row.original.level * INDENTATION_PER_LEVEL + INDENTATION_BASE;
        const buttonWidth = row.original.hasChildren ? BUTTON_WIDTH : 0;
        const availableTextWidth = `calc(100% - ${indentationWidth + buttonWidth + CELL_PADDING_X + MARGIN_LEFT_1}px)`;

        const valueLength = getValueStringLength(row.original.value);
        const isLongValue = valueLength > MAX_CELL_DISPLAY_CHARS / 3; // already long if we don't truncate

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

        const content = (
          <div className="flex items-start break-words">
            <div
              className="flex flex-shrink-0 items-center justify-end"
              style={{ width: `${indentationWidth}px` }}
            >
              {row.original.hasChildren && (
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
              )}
            </div>
            <span
              className={`ml-1 ${MONO_TEXT_CLASSES} cursor-text font-medium`}
              style={{ maxWidth: availableTextWidth }}
            >
              {itemBadgeType && (
                <span className="mr-1 inline-block align-middle">
                  <ItemBadge type={itemBadgeType} isSmall={true} />
                </span>
              )}
              {row.original.key}
            </span>
          </div>
        );

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
            <div className="sticky z-[5] py-1" style={{ top: topPosition }}>
              {content}
            </div>
          );
        }

        return content;
      },
    },
    {
      accessorKey: "value",
      header: "Value",
      size: 65,
      cell: ({ row }) => (
        <ValueCell
          row={row}
          expandedCells={expandedCells}
          toggleCellExpansion={toggleCellExpansion}
        />
      ),
    },
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
      shouldCollapse: boolean = false,
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
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup, index) => (
            <TableRow
              key={headerGroup.id}
              ref={index === 0 ? headerRef : undefined}
              className={stickyTopLevelKey ? "sticky top-0 z-20" : ""}
            >
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className={cn(
                    "h-8 px-2 py-1",
                    stickyTopLevelKey ? "bg-background" : "bg-transparent",
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
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
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
  projectIdForPromptButtons?: string;
  controlButtons?: React.ReactNode;
  currentView?: "pretty" | "json";
  externalExpansionState?: Record<string, boolean> | boolean;
  onExternalExpansionChange?: (
    expansion: Record<string, boolean> | boolean,
  ) => void;
  showNullValues?: boolean;
  stickyTopLevelKey?: boolean;
  showObservationTypeBadge?: boolean;
  /** Content to render between header and main content (e.g., thinking blocks) */
  afterHeader?: React.ReactNode;
}) {
  // Use pre-parsed data if available, otherwise parse on-demand
  const parsedJson = useMemo(() => {
    // If pre-parsed data is provided, use it directly (skip parsing)
    if (props.parsedJson !== undefined) {
      return props.parsedJson;
    }

    // If still parsing in Web Worker, return null (will show loading state)
    if (props.isParsing) {
      return null;
    }

    // Fast path: if already an object, likely no parsing needed
    if (typeof props.json !== "string") {
      return props.json;
    }

    // Only parse strings, with size/depth limits
    const result = deepParseJson(props.json, {
      maxSize: 500_000,
      maxDepth: 2,
    });

    return result;
  }, [props.json, props.parsedJson, props.isParsing]);
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
  const { isMarkdown, content: markdownContent } = useMemo(
    () => isMarkdownContent(parsedJson),
    [parsedJson],
  );

  const baseTableData = useMemo(() => {
    try {
      if (
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
  }, [parsedJson, isChatML, isMarkdown, actualCurrentView]);

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

    // No external state -> use smart expansion
    const optimalLevel = findOptimalExpansionLevel(
      baseTableData,
      DEFAULT_MAX_ROWS,
    );

    if (optimalLevel > 0) {
      const smartExpanded: ExpandedState = {};

      const expandRowsToLevel = (
        rows: JsonTableRow[],
        currentLevel: number,
      ) => {
        rows.forEach((row) => {
          if (row.hasChildren && currentLevel < optimalLevel) {
            const keyPath = convertRowIdToKeyPath(row.id);
            smartExpanded[keyPath] = true;

            const children = getRowChildren(row);
            if (children.length > 0) {
              expandRowsToLevel(children, currentLevel + 1);
            }
          }
        });
      };
      expandRowsToLevel(baseTableData, 0);

      return smartExpanded;
    }

    return {};
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
    } else {
      return finalState;
    }
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
    void copyTextToClipboard(textToCopy);

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
  const shouldUseTableView =
    isPrettyView && !isChatML && !isMarkdown && !emptyValueDisplay;

  const getBackgroundColorClass = () =>
    cn(
      ASSISTANT_TITLES.includes(props.title || "")
        ? "bg-accent-light-green"
        : "",
      SYSTEM_TITLES.includes(props.title || "") ? "bg-primary-foreground" : "",
    );

  const body = (
    <>
      {props.isLoading || props.isParsing ? (
        <div className="io-message-content">
          <div
            className={cn(
              getContainerClasses(
                props.title,
                props.scrollable,
                props.codeClassName,
              ),
            )}
          >
            <div className="space-y-2 p-3">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-3 w-2/3" />
              {props.isParsing && (
                <div className="mt-2 text-xs text-muted-foreground">
                  Parsing in background...
                </div>
              )}
            </div>
          </div>
        </div>
      ) : emptyValueDisplay && isPrettyView ? (
        <div className="io-message-content">
          <div
            className={cn(
              "flex items-center",
              getContainerClasses(
                props.title,
                props.scrollable,
                props.codeClassName,
              ),
            )}
          >
            <span className={`font-mono ${PREVIEW_TEXT_CLASSES}`}>
              {emptyValueDisplay}
            </span>
          </div>
        </div>
      ) : isMarkdownMode ? (
        <div className="io-message-content">
          <MarkdownView markdown={markdownContent || ""} />
        </div>
      ) : (
        <>
          {/* Always render JsonPrettyTable to preserve internal React Table state */}
          <div
            className="io-message-content"
            style={{ display: shouldUseTableView ? "flex" : "none" }}
          >
            <div
              className={getContainerClasses(
                props.title,
                props.scrollable,
                props.codeClassName,
                "flex whitespace-pre-wrap break-words text-xs",
              )}
            >
              {props.isLoading ? (
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
                />
              )}
            </div>
          </div>

          {/* Always render JSONView to preserve its state too */}
          <div
            className="io-message-content"
            style={{ display: shouldUseTableView ? "none" : "block" }}
          >
            <JSONView
              json={props.json}
              title={props.title} // Title value used for background styling
              hideTitle={true} // But hide the title, we display it
              className=""
              isLoading={props.isLoading}
              codeClassName={props.codeClassName}
              collapseStringsAfterLength={props.collapseStringsAfterLength}
              media={props.media}
              scrollable={props.scrollable}
              projectIdForPromptButtons={props.projectIdForPromptButtons}
              externalJsonCollapsed={jsonIsCollapsed}
              onToggleCollapse={handleJsonToggleCollapse}
            />
          </div>
        </>
      )}
      {props.media && props.media.length > 0 && isPrettyView && (
        <>
          <div className="my-1 px-2 py-1 text-xs text-muted-foreground">
            Media
          </div>
          <div className="flex flex-wrap gap-2 p-4 pt-1">
            {props.media.map((m) => (
              <LangfuseMediaView
                mediaAPIReturnValue={m}
                asFileIcon={true}
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
        props.className,
        props.scrollable ? "overflow-hidden" : "",
      )}
    >
      {props.title ? (
        <MarkdownJsonViewHeader
          title={props.title}
          titleIcon={props.titleIcon}
          canEnableMarkdown={false}
          handleOnValueChange={() => {}} // No-op, parent handles state
          handleOnCopy={handleOnCopy}
          controlButtons={
            <>
              {shouldUseTableView && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => expandAllRef.current?.()}
                  className="-mr-2 hover:bg-border"
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
              {!shouldUseTableView && !isMarkdownMode && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={handleJsonToggleCollapse}
                  className="-mr-2 hover:bg-border"
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
            isMarkdownMode ? getBackgroundColorClass() : "rounded-sm border",
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
