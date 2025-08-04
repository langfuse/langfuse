import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/src/utils/tailwind";
import { deepParseJson } from "@langfuse/shared";
import { Skeleton } from "@/src/components/ui/skeleton";
import { type MediaReturnType } from "@/src/features/media/validation";
import { LangfuseMediaView } from "@/src/components/ui/LangfuseMediaView";
import { MarkdownJsonViewHeader } from "@/src/components/ui/MarkdownJsonView";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { Button } from "@/src/components/ui/button";
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

// Constants for table layout
const INDENTATION_PER_LEVEL = 16;
const INDENTATION_BASE = 8;
const BUTTON_WIDTH = 16;
const MARGIN_LEFT_1 = 4;
const CELL_PADDING_X = 8; // px-2

// Constants for smart expansion logic
const DEFAULT_MAX_ROWS = 20;
const DEEPEST_DEFAULT_EXPANSION_LEVEL = 10;

const MAX_CELL_DISPLAY_CHARS = 2000;

const ASSISTANT_TITLES = ["assistant", "Output", "model"];
const SYSTEM_TITLES = ["system", "Input"];

const MONO_TEXT_CLASSES = "font-mono text-xs break-words";
const PREVIEW_TEXT_CLASSES = "italic text-gray-500 dark:text-gray-400";

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
      // had some false positives, so we really check for role/content to validate ChatML
      const hasRoleOrContent = json.some(
        (item) =>
          typeof item === "object" &&
          item !== null &&
          ("role" in item || "content" in item),
      );
      return hasRoleOrContent;
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
    const childRows: JsonTableRow[] = [];
    for (const row of rows) {
      if (row.hasChildren) {
        const children = getRowChildren(row);
        childRows.push(...children);
      }
    }

    if (childRows.length === 0) {
      return currentLevel;
    }

    return findOptimalRecursively(
      childRows,
      currentLevel + 1,
      newCumulativeCount,
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
}) {
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

        return (
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
              className={`ml-1 ${MONO_TEXT_CLASSES} font-medium`}
              style={{ maxWidth: availableTextWidth }}
            >
              {row.original.key}
            </span>
          </div>
        );
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
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className="h-8 bg-transparent px-2 py-1"
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
          {table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              onClick={() =>
                handleRowExpansion(
                  row,
                  onLazyLoadChildren,
                  expandedCells,
                  toggleCellExpansion,
                )
              }
              className={
                row.original.hasChildren ||
                (!row.original.hasChildren &&
                  row.original.type !== "array" &&
                  row.original.type !== "object" &&
                  getValueStringLength(row.original.value) >
                    MAX_CELL_DISPLAY_CHARS)
                  ? "cursor-pointer"
                  : ""
              }
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell
                  key={cell.id}
                  className="whitespace-normal px-2 py-1"
                  style={{ width: `${cell.column.columnDef.size}%` }}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function PrettyJsonView(props: {
  json?: unknown;
  title?: string;
  className?: string;
  isLoading?: boolean;
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
}) {
  const jsonDependency = useMemo(
    () =>
      typeof props.json === "string" ? props.json : JSON.stringify(props.json),
    [props.json],
  );

  const parsedJson = useMemo(() => {
    return deepParseJson(props.json);
    // We want to use jsonDependency as dep because it's more stable than props.json
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jsonDependency]);
  const actualCurrentView = props.currentView ?? "pretty";
  const expandAllRef = useRef<(() => void) | null>(null);
  const [allRowsExpanded, setAllRowsExpanded] = useState(false);
  const [jsonIsCollapsed, setJsonIsCollapsed] = useState(false);
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
          if (topLevelKeys.length > DEFAULT_MAX_ROWS) {
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

        // top-level is an object, start with its properties directly
        if (parsedJson?.constructor === Object) {
          return createTopLevelRows(parsedJson as Record<string, unknown>);
        }

        return transformJsonToTableData(parsedJson, "", 0, "", true);
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
      // user set specific expansions
      return props.externalExpansionState;
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

    return updateRowWithChildren(baseTableData);
  }, [baseTableData, expandedRowsWithChildren, actualExpansionState]);

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
    setJsonIsCollapsed(!jsonIsCollapsed);
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
      {emptyValueDisplay && isPrettyView ? (
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
          {props.isLoading ? (
            <Skeleton className="h-3 w-3/4" />
          ) : (
            <span className={`font-mono ${PREVIEW_TEXT_CLASSES}`}>
              {emptyValueDisplay}
            </span>
          )}
        </div>
      ) : isMarkdownMode ? (
        props.isLoading ? (
          <Skeleton className="h-3 w-3/4" />
        ) : (
          <MarkdownView markdown={markdownContent || ""} />
        )
      ) : (
        <>
          {/* Always render JsonPrettyTable to preserve internal React Table state */}
          <div
            className={getContainerClasses(
              props.title,
              props.scrollable,
              props.codeClassName,
              "flex whitespace-pre-wrap break-words text-xs",
            )}
            style={{ display: shouldUseTableView ? "flex" : "none" }}
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
              />
            )}
          </div>

          {/* Always render JSONView to preserve its state too */}
          <div style={{ display: shouldUseTableView ? "none" : "block" }}>
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
      {props.media && props.media.length > 0 && (
        <>
          <div className="mx-3 border-t px-2 py-1 text-xs text-muted-foreground">
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
          canEnableMarkdown={false}
          handleOnValueChange={() => {}} // No-op, parent handles state
          handleOnCopy={handleOnCopy}
          controlButtons={
            <>
              {props.controlButtons}
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
              {!isPrettyView && (
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
            </>
          }
        />
      ) : null}
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
