/* eslint-disable @typescript-eslint/no-use-before-define */
import {
  type ReactNode,
  type RefObject,
  useMemo,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { type ExpandedState } from "@tanstack/react-table";
import { deepParseJson } from "@langfuse/shared";
import { decodeUnicodeInJson } from "@/src/utils/decodeUnicodeInJson";
import { type MediaReturnType } from "@/src/features/media";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import { ChatMlArraySchema } from "@/src/components/schemas/ChatMlSchema";
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
import { isLargeRenderString } from "@/src/components/ui/largeStringGate";

// Custom expanded state type that allows false ("user intentionally collapsed all")
type LangfuseExpandedState = ExpandedState | false;

// Constants for smart expansion logic
// Used for nested objects to control smart expansion depth
const DEFAULT_MAX_ROWS = 20;

// Used for root-level objects where user has no parent to expand from. Therefore,
// set higher to ensure objects like metadata with many keys are still displayed
const DEFAULT_MAX_ROWS_IF_ROOT = 100;

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

  if ("messages" in json && Array.isArray(json.messages)) {
    const messagesArray = ChatMlArraySchema.safeParse(json.messages);
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

export function JsonViewController(props: {
  json?: unknown;
  parsedJson?: unknown; // Pre-parsed data (optional, from useParsedObservation hook)
  isLoading?: boolean;
  isParsing?: boolean;
  media?: MediaReturnType[];
  currentView?: "pretty" | "json";
  externalExpansionState?: Record<string, boolean> | boolean;
  onExternalExpansionChange?: (
    expansion: Record<string, boolean> | boolean,
  ) => void;
  showNullValues?: boolean;
  children: (state: JsonViewState) => ReactNode;
}) {
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
          const children = transformJsonToTableData(
            row.rawChildData,
            row.key,
            row.level + 1,
            row.id,
            false,
          );
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

  const handleOnCopy = () => {
    const textToCopy = stringifyJsonNode(parsedJson);
    copyTextToClipboard(textToCopy);
  };

  const handleJsonToggleCollapse = () => {
    const newCollapsed = !jsonIsCollapsed;
    setJsonIsCollapsed(newCollapsed);
    if (props.onExternalExpansionChange) {
      props.onExternalExpansionChange(!newCollapsed);
    }
  };

  const hasExpandableRows = useMemo(() => {
    if (typeof parsedJson !== "object" || parsedJson === null) return false;
    return Object.values(parsedJson as Record<string, unknown>).some((value) =>
      hasChildren(value, getValueType(value)),
    );
  }, [parsedJson]);
  const isEmpty =
    parsedJson === null ||
    parsedJson === undefined ||
    parsedJson === "" ||
    (typeof parsedJson === "object" &&
      !Array.isArray(parsedJson) &&
      Object.keys(parsedJson).length === 0);
  const standaloneMediaReferenceStrings =
    typeof markdownContent === "string"
      ? getStandaloneMediaReferenceStrings(markdownContent)
      : [];
  const remainingMarkdownMedia = filterAlreadyRenderedMedia(
    props.media,
    getRenderedInlineMediaIds({
      markdown: markdownContent ?? "",
    }),
  );

  const contentKind = (() => {
    if (largeStringValue !== null) return "large-string";
    if (actualCurrentView === "json") return "json";
    if (isEmpty) return "empty";
    if (isMarkdown) return "markdown";
    if (isChatML) return "json";
    return "table";
  })();

  return props.children({
    contentKind,
    parsedJson,
    largeStringValue,
    jsonViewInput,
    isLoading: props.isLoading,
    isParsing: props.isParsing,
    media: props.media,
    markdownContent,
    currentView: actualCurrentView,
    isMarkdown,
    isChatML,
    isEmpty,
    standaloneMediaReferenceStrings,
    remainingMarkdownMedia,
    tableData,
    expandAllRef,
    allRowsExpanded,
    setAllRowsExpanded,
    actualExpansionState,
    handleTableExpandedChange,
    handleLazyLoadChildren,
    handleForceUpdate,
    expandedCells,
    toggleCellExpansion,
    jsonIsCollapsed,
    handleJsonToggleCollapse,
    hasExpandableRows,
    copy: handleOnCopy,
    toggleAllRows: () => expandAllRef.current?.(),
  });
}

export type JsonViewState = {
  contentKind: "large-string" | "json" | "empty" | "markdown" | "table";
  parsedJson: unknown;
  largeStringValue: string | null;
  jsonViewInput: unknown;
  isLoading?: boolean;
  isParsing?: boolean;
  media?: MediaReturnType[];
  markdownContent: string | undefined;
  currentView: "pretty" | "json";
  isMarkdown: boolean;
  isChatML: boolean;
  isEmpty: boolean;
  standaloneMediaReferenceStrings: string[];
  remainingMarkdownMedia: MediaReturnType[];
  tableData: JsonTableRow[];
  expandAllRef: RefObject<(() => void) | null>;
  allRowsExpanded: boolean;
  setAllRowsExpanded: (expanded: boolean) => void;
  actualExpansionState: LangfuseExpandedState;
  handleTableExpandedChange: (
    updater: ExpandedState | ((prev: ExpandedState) => ExpandedState),
  ) => void;
  handleLazyLoadChildren: (rowId: string) => void;
  handleForceUpdate: () => void;
  expandedCells: Set<string>;
  toggleCellExpansion: (cellId: string) => void;
  jsonIsCollapsed: boolean;
  handleJsonToggleCollapse: () => void;
  hasExpandableRows: boolean;
  copy: () => void;
  toggleAllRows: () => void;
};

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
