import {
  useRef,
  useMemo,
  memo,
  useEffect,
  useState,
  useLayoutEffect,
  useImperativeHandle,
  forwardRef,
  type RefObject,
} from "react";
import type {
  JSONTheme,
  StringWrapMode,
  JsonSection,
  SectionContext,
} from "./types";
import { MultiSectionJsonViewerHeader } from "./components/MultiSectionJsonViewerHeader";
import type { TreeState } from "./utils/treeStructure";
import { getAllVisibleNodes, treeNodeToFlatRow } from "./utils/treeNavigation";
import { JsonRowFixed } from "./components/JsonRowFixed";
import { JsonRowScrollable } from "./components/JsonRowScrollable";
import { useJsonSearch } from "./hooks/useJsonSearch";
import { useJsonViewerLayout } from "./hooks/useJsonViewerLayout";
import { searchInTree } from "./utils/searchJson";
import {
  getCommentRangesForRow,
  getCommentCountForSection,
  type CommentedPathsByField,
} from "./utils/commentRanges";
import { pathArrayToJsonPath } from "./utils/pathUtils";
import { type MediaReturnType } from "@/src/features/media/validation";

export interface SimpleMultiSectionViewerHandle {
  scrollToSection: (sectionKey: string) => void;
}

export interface SimpleMultiSectionViewerProps {
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

export const SimpleMultiSectionViewer = memo(
  forwardRef<SimpleMultiSectionViewerHandle, SimpleMultiSectionViewerProps>(
    function SimpleMultiSectionViewer(
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
      const containerRef = useRef<HTMLDivElement>(null);
      const [containerWidth, setContainerWidth] = useState<number | null>(null);

      // Build sections map for O(1) lookup
      const sectionsMap = useMemo(() => {
        return new Map(sections.map((s) => [s.key, s]));
      }, [sections]);

      // Measure scroll container width for sticky headers
      useLayoutEffect(() => {
        const container = scrollContainerRef?.current;
        if (!container) return;

        const updateWidth = () => {
          const newWidth = container.clientWidth;
          setContainerWidth((prev) => (prev === newWidth ? prev : newWidth));
        };

        updateWidth(); // Initial measurement

        if (
          typeof window !== "undefined" &&
          typeof ResizeObserver !== "undefined"
        ) {
          const resizeObserver = new ResizeObserver(updateWidth);
          resizeObserver.observe(container);
          return () => resizeObserver.disconnect();
        }
      }, [scrollContainerRef]);

      // Get all visible nodes
      const allNodes = useMemo(() => {
        if (!tree) return [];
        return getAllVisibleNodes(tree.rootNode);
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [tree, expansionVersion]);

      // Filter out meta-root (depth: -1)
      const visibleNodes = useMemo(() => {
        return allNodes.filter((node) => node.depth >= 0);
      }, [allNodes]);

      // Layout calculations
      const {
        maxLineNumberDigits,
        fixedColumnWidth,
        scrollableMinWidth,
        scrollableMaxWidth,
      } = useJsonViewerLayout({
        tree,
        expansionVersion,
        theme,
        showLineNumbers,
        totalLineCount: tree?.totalNodeCount,
        stringWrapMode,
        truncateStringsAt,
      });

      // Search matches
      const searchMatches = useMemo(() => {
        if (!searchQuery || !tree) return [];
        return searchInTree(tree, searchQuery);
      }, [tree, searchQuery]);

      const { matchMap, currentMatch, currentMatchIndexInRow } = useJsonSearch(
        searchMatches,
        currentMatchIndex,
      );

      // Store refs to row elements for scroll-to-match
      const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

      // Scroll to current match when it changes
      useEffect(() => {
        if (!currentMatch) return;
        const element = rowRefs.current.get(currentMatch.rowId);
        if (element) {
          element.scrollIntoView({ block: "center", behavior: "smooth" });
        }
      }, [currentMatch]);

      // Expose scrollToSection method via ref
      useImperativeHandle(
        ref,
        () => ({
          scrollToSection: (sectionKey: string) => {
            const container = scrollContainerRef?.current;
            if (!container) return;

            // Find section by data-section-key attribute
            const sectionElement = container.querySelector(
              `[data-section-key="${sectionKey}"]`,
            );
            if (sectionElement) {
              sectionElement.scrollIntoView({
                behavior: "smooth",
                block: "start",
              });
            }
          },
        }),
        [scrollContainerRef],
      );

      // Group nodes by section for rendering
      const sectionGroups = useMemo(() => {
        interface SectionGroup {
          header: (typeof visibleNodes)[0];
          content: typeof visibleNodes;
          spacer: (typeof visibleNodes)[0] | null;
          footer: (typeof visibleNodes)[0] | null;
        }

        const result: SectionGroup[] = [];
        let currentSection: SectionGroup | null = null;

        visibleNodes.forEach((node) => {
          if (node.nodeType === "section-header") {
            currentSection = {
              header: node,
              content: [],
              spacer: null,
              footer: null,
            };
            result.push(currentSection);
          } else if (node.nodeType === "section-spacer") {
            if (currentSection) {
              currentSection.spacer = node;
            }
          } else if (node.nodeType === "section-footer") {
            if (currentSection) {
              currentSection.footer = node;
            }
          } else if (node.nodeType === "json") {
            if (currentSection) {
              currentSection.content.push(node);
            }
          }
        });

        return result;
      }, [visibleNodes]);

      const renderJsonRow = (node: (typeof visibleNodes)[0], index: number) => {
        const searchMatch = matchMap.get(node.id);
        const isCurrentMatch = currentMatch?.rowId === node.id;
        const row = treeNodeToFlatRow(node, index);
        const matchCount = matchCounts?.get(node.id);

        // Get comment ranges for this row
        const commentRanges = getCommentRangesForRow(
          row,
          node.sectionKey,
          commentedPathsByField,
        );
        const rowJsonPath = pathArrayToJsonPath(row.pathArray);

        return (
          <div
            key={node.id}
            ref={(el) => {
              if (el) {
                rowRefs.current.set(node.id, el);
              } else {
                rowRefs.current.delete(node.id);
              }
            }}
            style={{
              display: "grid",
              gridTemplateColumns: `${fixedColumnWidth}px auto`,
              width: stringWrapMode === "nowrap" ? undefined : "100%",
              backgroundColor: node.backgroundColor || theme.background,
            }}
          >
            {/* Fixed column */}
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
                lineNumber={node.sectionLineNumber ?? index + 1}
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

            {/* Scrollable column */}
            <div
              style={{
                width: "fit-content",
                minWidth: scrollableMinWidth ? `${scrollableMinWidth}px` : 0,
                maxWidth: scrollableMaxWidth
                  ? `${scrollableMaxWidth}px`
                  : undefined,
                overflow: stringWrapMode === "nowrap" ? undefined : "hidden",
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
      };

      return (
        <div
          ref={containerRef}
          style={{
            width: stringWrapMode === "wrap" ? "100%" : "fit-content",
            minWidth: "100%",
            backgroundColor: theme.background,
            color: theme.foreground,
            fontFamily: "monospace",
          }}
        >
          <div style={{ position: "relative" }}>
            {sectionGroups.map((sectionGroup) => {
              // Look up JsonSection for render functions
              const sectionKey = sectionGroup.header.sectionKey;
              const jsonSection = sectionKey
                ? sectionsMap.get(sectionKey)
                : null;

              // Get section context (using hook requires component wrapper)
              const sectionContext = {
                sectionKey: sectionKey || "",
                rowCount:
                  sectionGroup.header.totalDescendantCount ??
                  sectionGroup.content.length,
                isExpanded: sectionGroup.header.isExpanded,
                setExpanded: (_expanded: boolean) => {
                  if (onToggleExpansion) {
                    onToggleExpansion(sectionGroup.header.id);
                  }
                },
              };

              // Derive title from section config or capitalize key
              const title =
                jsonSection?.title ||
                (sectionKey
                  ? sectionKey.charAt(0).toUpperCase() + sectionKey.slice(1)
                  : "");

              // Filter media for this section
              const sectionMedia = media?.filter((m) => m.field === sectionKey);

              // Get comment count for this section
              const sectionCommentCount = getCommentCountForSection(
                sectionKey,
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
                  key={sectionGroup.header.id}
                  data-section-key={sectionKey}
                  style={{
                    width: stringWrapMode === "wrap" ? "100%" : "fit-content",
                    backgroundColor:
                      sectionGroup.header.backgroundColor || theme.background,
                  }}
                >
                  {/* Render section header */}
                  <div
                    style={{
                      position: "sticky",
                      top: 0,
                      left: 0,
                      width: containerWidth ? `${containerWidth}px` : "100%",
                      zIndex: 10,
                      backgroundColor:
                        sectionGroup.header.backgroundColor || theme.background,
                      borderBottom: "1px solid",
                      borderColor: theme.punctuationColor || "#e5e7eb",
                    }}
                  >
                    {headerContent}
                  </div>

                  {/* Render section content */}
                  <div
                    style={{
                      width: stringWrapMode === "wrap" ? "100%" : "max-content",
                    }}
                  >
                    {sectionGroup.content.map((node, index) =>
                      renderJsonRow(node, index),
                    )}
                  </div>

                  {/* Render spacer if exists */}
                  {sectionGroup.spacer && (
                    <div
                      style={{
                        height: `${sectionGroup.spacer.spacerHeight}px`,
                      }}
                    />
                  )}

                  {/* Render section footer if exists */}
                  {jsonSection?.renderFooter && sectionContext.isExpanded && (
                    <div
                      style={{
                        width: containerWidth ? `${containerWidth}px` : "100%",
                        paddingBottom: "0.5rem",
                      }}
                    >
                      {jsonSection.renderFooter(sectionContext)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    },
  ),
);
