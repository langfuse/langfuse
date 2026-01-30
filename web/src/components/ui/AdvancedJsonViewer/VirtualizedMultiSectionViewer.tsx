import {
  useEffect,
  useMemo,
  memo,
  useRef,
  useLayoutEffect,
  useState,
  useImperativeHandle,
  forwardRef,
  type RefObject,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type {
  JSONTheme,
  StringWrapMode,
  JsonSection,
  SectionContext,
} from "./types";
import { MultiSectionJsonViewerHeader } from "./components/MultiSectionJsonViewerHeader";
import type { TreeState } from "./utils/treeStructure";
import {
  getNodeByIndex,
  treeNodeToFlatRow,
  findNodeIndex,
  findSectionHeaderIndex,
} from "./utils/treeNavigation";
import { JsonRowFixed } from "./components/JsonRowFixed";
import { JsonRowScrollable } from "./components/JsonRowScrollable";
import { useJsonSearch } from "./hooks/useJsonSearch";
import { useJsonViewerLayout } from "./hooks/useJsonViewerLayout";
import { searchInTree } from "./utils/searchJson";
import { useMonospaceCharWidth } from "./hooks/useMonospaceCharWidth";
import {
  getCommentRangesForRow,
  getCommentCountForSection,
  type CommentedPathsByField,
} from "./utils/commentRanges";
import { pathArrayToJsonPath } from "./utils/pathUtils";
import { type MediaReturnType } from "@/src/features/media/validation";

export interface VirtualizedMultiSectionViewerHandle {
  scrollToSection: (sectionKey: string) => void;
}

export interface VirtualizedMultiSectionViewerProps {
  tree: TreeState;
  sections: JsonSection[];
  expansionVersion: number;
  theme: JSONTheme;
  defaultRenderHeader?: (
    context: SectionContext & { title: string },
  ) => React.ReactNode;
  searchQuery?: string;
  currentMatchIndex?: number;
  matchCounts?: Map<string, number>;
  showLineNumbers?: boolean;
  enableCopy?: boolean;
  stringWrapMode?: StringWrapMode;
  truncateStringsAt?: number | null;
  onToggleExpansion?: (nodeId: string) => void;
  scrollContainerRef?: RefObject<HTMLDivElement>;
  media?: MediaReturnType[];
  commentedPathsByField?: CommentedPathsByField;
}

export const VirtualizedMultiSectionViewer = memo(
  forwardRef<
    VirtualizedMultiSectionViewerHandle,
    VirtualizedMultiSectionViewerProps
  >(function VirtualizedMultiSectionViewer(
    {
      tree,
      sections,
      expansionVersion,
      theme,
      defaultRenderHeader,
      searchQuery,
      currentMatchIndex = 0,
      matchCounts,
      showLineNumbers = true,
      enableCopy = false,
      stringWrapMode = "wrap",
      truncateStringsAt = 100,
      onToggleExpansion,
      scrollContainerRef,
      media,
      commentedPathsByField,
    },
    ref,
  ) {
    const parentRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState<number | null>(null);

    // Measure actual monospace character width for accurate height estimation
    const charWidth = useMonospaceCharWidth();

    // Build sections map for O(1) lookup
    const sectionsMap = useMemo(() => {
      return new Map(sections.map((s) => [s.key, s]));
    }, [sections]);

    // Measure scroll container width for sticky headers
    useLayoutEffect(() => {
      const container = scrollContainerRef?.current;
      if (!container) {
        return;
      }

      const updateWidth = () => {
        const width = container.clientWidth;
        setContainerWidth(width);
      };

      updateWidth(); // Initial measurement

      if (
        typeof window !== "undefined" &&
        typeof ResizeObserver !== "undefined"
      ) {
        const resizeObserver = new ResizeObserver(updateWidth);
        resizeObserver.observe(container);
        return () => {
          resizeObserver.disconnect();
        };
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scrollContainerRef?.current]);

    // Row count (includes meta-root, but we skip it in rendering)
    const rowCount = tree ? 1 + tree.rootNode.visibleDescendantCount : 0;

    // Layout calculations
    const {
      maxLineNumberDigits,
      fixedColumnWidth,
      scrollableMinWidth,
      scrollableMaxWidth,
      estimateSize,
    } = useJsonViewerLayout({
      tree,
      expansionVersion,
      theme,
      showLineNumbers,
      totalLineCount: tree?.totalNodeCount,
      stringWrapMode,
      truncateStringsAt,
      charWidth,
    });

    // Calculate total content width (stable, memoized)
    const totalContentWidth = useMemo(() => {
      if (!tree) return undefined;

      if (stringWrapMode === "nowrap") {
        return fixedColumnWidth + tree.maxContentWidth;
      }

      if (scrollableMaxWidth) {
        return fixedColumnWidth + scrollableMaxWidth;
      }

      return undefined;
    }, [tree, fixedColumnWidth, stringWrapMode, scrollableMaxWidth]);

    // Calculate effective row width (takes max of content width and container width)
    const effectiveRowWidth = useMemo(() => {
      if (!totalContentWidth && !containerWidth) return undefined;
      if (!totalContentWidth) return containerWidth;
      if (!containerWidth) return totalContentWidth;
      return Math.max(totalContentWidth, containerWidth);
    }, [totalContentWidth, containerWidth]);

    // Search matches
    const searchMatches = useMemo(() => {
      if (!searchQuery || !tree) return [];
      return searchInTree(tree, searchQuery);
    }, [tree, searchQuery]);

    const { matchMap, currentMatch, currentMatchIndexInRow } = useJsonSearch(
      searchMatches,
      currentMatchIndex,
    );

    // Virtualizer with custom estimateSize for different node types
    const rowVirtualizer = useVirtualizer({
      count: rowCount,
      getScrollElement: () => scrollContainerRef?.current || parentRef.current,
      estimateSize: (index) => {
        if (!tree) return 16;
        const node = getNodeByIndex(tree.rootNode, index);

        if (!node) return 16;

        // Meta-root should have 0 height (it's never rendered)
        if (node.nodeType === "meta") return 0;

        // Custom heights for different node types
        if (node.nodeType === "section-header") return 32;
        if (node.nodeType === "section-footer") return 40;
        if (node.nodeType === "section-spacer") return node.spacerHeight || 0;

        // Regular JSON rows
        return estimateSize(index);
      },
      overscan: 100,
      measureElement:
        typeof window !== "undefined"
          ? (element) => element.getBoundingClientRect().height
          : undefined,
      getItemKey: (index) => {
        if (!tree) return index;
        const node = getNodeByIndex(tree.rootNode, index);
        return node ? node.id : index;
      },
    });

    // Scroll to current search match
    useEffect(() => {
      if (!currentMatch || !tree) return;

      const index = findNodeIndex(tree.rootNode, currentMatch.rowId);

      if (index !== -1) {
        rowVirtualizer.scrollToIndex(index, { align: "center" });
      }
    }, [currentMatch, tree, rowVirtualizer]);

    // Expose scrollToSection method via ref
    useImperativeHandle(
      ref,
      () => ({
        scrollToSection: (sectionKey: string) => {
          if (!tree) return;

          const index = findSectionHeaderIndex(tree.rootNode, sectionKey);

          if (index !== -1) {
            rowVirtualizer.scrollToIndex(index, {
              align: "start",
              behavior: "auto",
            });
          }
        },
      }),
      [tree, rowVirtualizer],
    );

    const virtualItems = rowVirtualizer.getVirtualItems();

    return (
      <div
        ref={parentRef}
        id="virtualized-multi-section-parent"
        style={{
          height: "100%",
          width: stringWrapMode === "nowrap" ? "fit-content" : "100%",
          minWidth: "100%",
          backgroundColor: theme.background,
        }}
      >
        <div
          id="virtualized-multi-section-content"
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            minWidth: totalContentWidth ? `${totalContentWidth}px` : "100%",
            width: "max-content",
            position: "relative",
          }}
        >
          {virtualItems.map((virtualRow) => {
            const node = getNodeByIndex(tree.rootNode, virtualRow.index);

            if (!node) return null;

            // Skip meta-root (depth: -1)
            if (node.depth < 0) return null;

            const searchMatch = matchMap.get(node.id);
            const isCurrentMatch = currentMatch?.rowId === node.id;

            // Render based on node type
            if (node.nodeType === "section-header") {
              const jsonSection = node.sectionKey
                ? sectionsMap.get(node.sectionKey)
                : null;
              const sectionContext = {
                sectionKey: node.sectionKey || "",
                rowCount:
                  node.totalDescendantCount ?? node.visibleDescendantCount,
                isExpanded: node.isExpanded,
                setExpanded: (_expanded: boolean) => {
                  if (onToggleExpansion) {
                    onToggleExpansion(node.id);
                  }
                },
              };

              // Derive title from section config or capitalize key
              const title =
                jsonSection?.title ||
                (node.sectionKey
                  ? node.sectionKey.charAt(0).toUpperCase() +
                    node.sectionKey.slice(1)
                  : "");

              // Filter media for this section
              const sectionMedia = media?.filter(
                (m) => m.field === node.sectionKey,
              );

              // Get comment count for this section
              const sectionCommentCount = getCommentCountForSection(
                node.sectionKey,
                commentedPathsByField,
              );

              // Render header with fallback chain
              let headerContent;
              if (jsonSection?.renderHeader) {
                headerContent = jsonSection.renderHeader(sectionContext);
              } else if (defaultRenderHeader) {
                headerContent = defaultRenderHeader({
                  ...sectionContext,
                  title,
                });
              } else {
                headerContent = (
                  <MultiSectionJsonViewerHeader
                    title={title}
                    context={sectionContext}
                    media={sectionMedia}
                    commentCount={sectionCommentCount}
                  />
                );
              }

              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  data-section-key={node.sectionKey}
                  ref={rowVirtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    minWidth: effectiveRowWidth
                      ? `${effectiveRowWidth}px`
                      : "100%",
                    width: "max-content",
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <div
                    style={{
                      position: "sticky",
                      left: 0,
                      width: containerWidth ? `${containerWidth}px` : "100%",
                      zIndex: 2,
                      backgroundColor: node.backgroundColor || theme.background,
                      borderBottom: "1px solid",
                      borderColor: theme.punctuationColor || "#e5e7eb",
                    }}
                  >
                    {headerContent}
                  </div>
                </div>
              );
            }

            if (node.nodeType === "section-footer") {
              // Skip footer if section is collapsed
              if (!node.isExpanded) return null;

              const jsonSection = node.sectionKey
                ? sectionsMap.get(node.sectionKey)
                : null;
              const sectionContext = {
                sectionKey: node.sectionKey || "",
                rowCount: 0, // Footer doesn't track row count
                isExpanded: true, // Footers are always shown
                setExpanded: () => {}, // No-op
              };

              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: containerWidth ? `${containerWidth}px` : "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                    backgroundColor: node.backgroundColor || theme.background,
                    paddingBottom: "0.5rem",
                  }}
                >
                  {jsonSection?.renderFooter?.(sectionContext)}
                </div>
              );
            }

            if (node.nodeType === "section-spacer") {
              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    minWidth: effectiveRowWidth
                      ? `${effectiveRowWidth}px`
                      : "100%",
                    width: "max-content",
                    transform: `translateY(${virtualRow.start}px)`,
                    height: `${node.spacerHeight}px`,
                    backgroundColor: node.backgroundColor || theme.background,
                  }}
                />
              );
            }

            // Regular JSON row
            const row = treeNodeToFlatRow(node, virtualRow.index);
            const matchCount = matchCounts?.get(row.id);

            // Get comment ranges for this row
            const commentRanges = getCommentRangesForRow(
              row,
              node.sectionKey,
              commentedPathsByField,
            );
            const rowJsonPath = pathArrayToJsonPath(row.pathArray);

            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  minWidth: effectiveRowWidth
                    ? `${effectiveRowWidth}px`
                    : "100%",
                  width: "max-content",
                  transform: `translateY(${virtualRow.start}px)`,
                  display: "grid",
                  gridTemplateColumns: `${fixedColumnWidth}px auto`,
                  backgroundColor: node.backgroundColor || theme.background,
                }}
              >
                {/* Fixed column (line numbers + expand buttons) */}
                <div
                  style={{
                    position: "sticky",
                    left: 0,
                    zIndex: 1,
                    width: `${fixedColumnWidth}px`,
                    backgroundColor: node.backgroundColor || theme.background,
                  }}
                >
                  <JsonRowFixed
                    row={row}
                    theme={theme}
                    showLineNumber={showLineNumbers}
                    lineNumber={node.sectionLineNumber ?? virtualRow.index + 1}
                    maxLineNumberDigits={maxLineNumberDigits}
                    searchMatch={searchMatch}
                    isCurrentMatch={isCurrentMatch}
                    matchCount={matchCount}
                    currentMatchIndexInRow={
                      isCurrentMatch ? currentMatchIndexInRow : undefined
                    }
                    onToggleExpansion={onToggleExpansion}
                    stringWrapMode={stringWrapMode}
                  />
                </div>

                {/* Scrollable column (JSON content) */}
                <div
                  style={{
                    width: "fit-content",
                    minWidth: scrollableMinWidth
                      ? `${scrollableMinWidth}px`
                      : 0,
                    maxWidth: scrollableMaxWidth
                      ? `${scrollableMaxWidth}px`
                      : undefined,
                    overflow:
                      stringWrapMode === "nowrap" ? undefined : "hidden",
                  }}
                >
                  <JsonRowScrollable
                    row={row}
                    theme={theme}
                    searchMatch={searchMatch}
                    isCurrentMatch={isCurrentMatch}
                    enableCopy={enableCopy}
                    stringWrapMode={stringWrapMode}
                    truncateStringsAt={truncateStringsAt}
                    jsonPath={rowJsonPath}
                    commentRanges={commentRanges}
                    sectionKey={node.sectionKey}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }),
);
