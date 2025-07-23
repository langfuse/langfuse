import { useMemo, useState, useEffect, memo, useRef, useCallback } from "react";
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

// Constants for array display logic
const SMALL_ARRAY_THRESHOLD = 5;
const ARRAY_PREVIEW_ITEMS = 3;
const OBJECT_PREVIEW_KEYS = 2;

// Constants for table layout
const INDENTATION_PER_LEVEL = 16;
const INDENTATION_BASE = 8;
const BUTTON_WIDTH = 16;
const MARGIN_LEFT_1 = 4;
const CELL_PADDING_X = 8; // px-2

const ASSISTANT_TITLES = ["assistant", "Output"];
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
    if (directArray.success) return true;
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

  // Check if render as markdown: object has one key and the value is a markdown like string
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

interface JsonTableRow {
  id: string;
  key: string;
  value: unknown;
  type:
    | "string"
    | "number"
    | "boolean"
    | "object"
    | "array"
    | "null"
    | "undefined";
  hasChildren: boolean;
  level: number;
  subRows?: JsonTableRow[];
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

function transformJsonToTableData(
  json: unknown,
  parentKey = "",
  level = 0,
  parentId = "",
): JsonTableRow[] {
  const rows: JsonTableRow[] = [];

  if (typeof json !== "object" || json === null) {
    return [
      {
        id: parentId || "0",
        key: parentKey || "root",
        value: json,
        type: getValueType(json),
        hasChildren: false,
        level,
      },
    ];
  }

  const entries = Array.isArray(json)
    ? json.map((item, index) => [index.toString(), item])
    : Object.entries(json);

  entries.forEach(([key, value]) => {
    const id = parentId ? `${parentId}-${key}` : key;
    const valueType = getValueType(value);
    const childrenExist = hasChildren(value, valueType);

    const row: JsonTableRow = {
      id,
      key,
      value,
      type: valueType,
      hasChildren: childrenExist,
      level,
    };

    if (childrenExist) {
      const children = transformJsonToTableData(value, key, level + 1, id);
      row.subRows = children;
    }

    rows.push(row);
  });

  return rows;
}

function renderArrayValue(arr: unknown[]): JSX.Element {
  if (arr.length === 0) {
    return <span className={PREVIEW_TEXT_CLASSES}>empty list</span>;
  }

  if (arr.length <= SMALL_ARRAY_THRESHOLD) {
    // Show inline values for small arrays
    const displayItems = arr
      .map((item) => {
        const itemType = getValueType(item);
        if (itemType === "string") return `"${String(item)}"`;
        if (itemType === "object" && item !== null) {
          const obj = item as Record<string, unknown>;
          const keys = Object.keys(obj);
          if (keys.length === 0) return "{}";
          if (keys.length <= OBJECT_PREVIEW_KEYS) {
            const keyPreview = keys.map((k) => `"${k}": ...`).join(", ");
            return `{${keyPreview}}`;
          } else {
            return `{"${keys[0]}": ...}`;
          }
        }
        if (itemType === "array") return "...";
        return String(item);
      })
      .join(", ");
    return <span className={PREVIEW_TEXT_CLASSES}>[{displayItems}]</span>;
  } else {
    // Show truncated values for large arrays
    const preview = arr
      .slice(0, ARRAY_PREVIEW_ITEMS)
      .map((item) => {
        const itemType = getValueType(item);
        if (itemType === "string") return `"${String(item)}"`;
        if (itemType === "object" || itemType === "array") return "...";
        return String(item);
      })
      .join(", ");
    return (
      <span className={PREVIEW_TEXT_CLASSES}>
        [{preview}, ...{arr.length - ARRAY_PREVIEW_ITEMS} more]
      </span>
    );
  }
}

function renderObjectValue(obj: Record<string, unknown>): JSX.Element {
  const keys = Object.keys(obj);
  if (keys.length === 0) {
    return <span className={PREVIEW_TEXT_CLASSES}>empty object</span>;
  }
  return <span className={PREVIEW_TEXT_CLASSES}>{keys.length} items</span>;
}

const ValueCell = memo(({ row }: { row: Row<JsonTableRow> }) => {
  const { value, type } = row.original;

  const renderValue = () => {
    switch (type) {
      case "string":
        return (
          <span className="text-green-600 dark:text-green-400">
            &quot;{String(value)}&quot;
          </span>
        );
      case "number":
        return (
          <span className="text-blue-600 dark:text-blue-400">
            {String(value)}
          </span>
        );
      case "boolean":
        return (
          <span className="text-orange-600 dark:text-orange-400">
            {String(value)}
          </span>
        );
      case "null":
        return (
          <span className="italic text-gray-500 dark:text-gray-400">null</span>
        );
      case "undefined":
        return (
          <span className="text-gray-500 dark:text-gray-400">undefined</span>
        );
      case "array":
        return renderArrayValue(value as unknown[]);
      case "object":
        return renderObjectValue(value as Record<string, unknown>);
      default:
        return (
          <span className="text-gray-600 dark:text-gray-400">
            {String(value)}
          </span>
        );
    }
  };

  return (
    <div className={`${MONO_TEXT_CLASSES} max-w-full`}>{renderValue()}</div>
  );
});

ValueCell.displayName = "ValueCell";

function JsonPrettyTable({
  data,
  expandAllRef,
  onExpandStateChange,
  noBorder = false,
}: {
  data: JsonTableRow[];
  expandAllRef?: React.MutableRefObject<(() => void) | null>;
  onExpandStateChange?: (allExpanded: boolean) => void;
  noBorder?: boolean;
}) {
  const [expanded, setExpanded] = useState<ExpandedState>({});

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
                    row.toggleExpanded();
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
      cell: ({ row }) => <ValueCell row={row} />,
    },
  ];

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getSubRows: (row) => row.subRows,
    state: {
      expanded,
    },
    onExpandedChange: setExpanded,
    enableColumnResizing: false,
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

  const handleToggleExpandAll = useCallback(() => {
    if (allRowsExpanded) {
      table.toggleAllRowsExpanded(false);
    } else {
      table.toggleAllRowsExpanded(true);
    }
  }, [allRowsExpanded, table]);

  useEffect(() => {
    if (expandAllRef) {
      expandAllRef.current = handleToggleExpandAll;
    }
  }, [expandAllRef, handleToggleExpandAll]);

  useEffect(() => {
    setExpanded({});
    onExpandStateChange?.(false);
  }, [data, onExpandStateChange]);

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
              onClick={() => {
                if (row.original.hasChildren) {
                  row.toggleExpanded();
                }
              }}
              className={row.original.hasChildren ? "cursor-pointer" : ""}
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
}) {
  const parsedJson = useMemo(() => deepParseJson(props.json), [props.json]);
  const actualCurrentView = props.currentView ?? "pretty";
  const expandAllRef = useRef<(() => void) | null>(null);
  const [allRowsExpanded, setAllRowsExpanded] = useState(false);
  const [jsonIsCollapsed, setJsonIsCollapsed] = useState(false);

  const isChatML = useMemo(() => isChatMLFormat(parsedJson), [parsedJson]);
  const markdownCheck = useMemo(
    () => isMarkdownContent(parsedJson),
    [parsedJson],
  );

  const tableData = useMemo(() => {
    try {
      if (
        actualCurrentView === "pretty" &&
        parsedJson !== null &&
        parsedJson !== undefined &&
        !isChatML &&
        !markdownCheck.isMarkdown
      ) {
        // Helper function to create rows from object entries at level 0
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
            };

            if (childrenExist) {
              const children = transformJsonToTableData(value, key, 1, key);
              row.subRows = children;
            }

            rows.push(row);
          });

          return rows;
        };

        // If top-level is an object, start with its properties directly
        if (
          typeof parsedJson === "object" &&
          parsedJson !== null &&
          !Array.isArray(parsedJson) &&
          parsedJson.constructor === Object
        ) {
          return createTopLevelRows(parsedJson as Record<string, unknown>);
        }

        return transformJsonToTableData(parsedJson);
      }
      return [];
    } catch (error) {
      console.error("Error transforming JSON to table data:", error);
      return [];
    }
  }, [parsedJson, actualCurrentView, isChatML, markdownCheck.isMarkdown]);

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
  const isMarkdownMode =
    markdownCheck.isMarkdown && actualCurrentView === "pretty";
  const shouldUseTableView =
    actualCurrentView === "pretty" &&
    !isChatML &&
    !markdownCheck.isMarkdown &&
    !emptyValueDisplay;

  const getBackgroundColorClass = () =>
    cn(
      ASSISTANT_TITLES.includes(props.title || "")
        ? "bg-accent-light-green"
        : "",
      SYSTEM_TITLES.includes(props.title || "") ? "bg-primary-foreground" : "",
    );

  const body = (
    <>
      {emptyValueDisplay && actualCurrentView === "pretty" ? (
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
          <MarkdownView markdown={markdownCheck.content || ""} />
        )
      ) : shouldUseTableView ? (
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
            />
          )}
        </div>
      ) : (
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
              {actualCurrentView === "json" && (
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
