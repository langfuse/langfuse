import { useMemo, useEffect, type RefObject } from "react";
import type {
  JsonSection,
  PartialJSONTheme,
  StringWrapMode,
  SectionContext,
} from "./types";
import { useMultiSectionTreeState } from "./hooks/useMultiSectionTreeState";
import { useJsonTheme } from "./hooks/useJsonTheme";
import { VirtualizedMultiSectionViewer } from "./VirtualizedMultiSectionViewer";
import { SimpleMultiSectionViewer } from "./SimpleMultiSectionViewer";
import { SectionContextProvider } from "./contexts/SectionContext";
import { searchInTree, getMatchCountsPerNode } from "./utils/searchJson";

export interface MultiSectionJsonViewerProps {
  /** Section definitions (key, data, header, footer, backgroundColor) */
  sections: JsonSection[];

  /** Force virtualization on/off (overrides auto-detection) */
  virtualized?: boolean;

  /** Theme customization */
  theme?: PartialJSONTheme;

  /** Default header renderer (used when section.renderHeader is not provided) */
  defaultRenderHeader?: (
    context: SectionContext & { title: string },
  ) => React.ReactNode;

  /** Controlled search */
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  currentMatchIndex?: number;
  onCurrentMatchIndexChange?: (index: number) => void;
  onSearchResults?: (matchCount: number) => void;

  /** Display options */
  showLineNumbers?: boolean;
  enableCopy?: boolean;
  stringWrapMode?: StringWrapMode;
  truncateStringsAt?: number | null;

  /** Styling */
  className?: string;

  /** Scroll container ref (for virtualization) */
  scrollContainerRef?: RefObject<HTMLDivElement>;
}

/**
 * Multi-section JSON viewer with collapsible sections
 *
 * Features:
 * - Multiple JSON roots in one viewer
 * - Sticky section headers
 * - Search across all sections with auto-expand
 * - Line numbering resets per section
 * - Context API for header/footer components
 * - Maintains JIT O(log n) performance
 */
export function MultiSectionJsonViewer({
  sections,
  virtualized: virtualizedProp,
  theme: userTheme,
  defaultRenderHeader,
  searchQuery,
  onSearchQueryChange: _onSearchQueryChange,
  currentMatchIndex,
  onCurrentMatchIndexChange: _onCurrentMatchIndexChange,
  onSearchResults,
  showLineNumbers = true,
  enableCopy = true,
  stringWrapMode = "wrap",
  truncateStringsAt = 100,
  className,
  scrollContainerRef,
}: MultiSectionJsonViewerProps) {
  // Resolve theme
  const theme = useJsonTheme(userTheme);

  // Extract data configs for tree building (pure data, no presentation)
  const sectionConfigs = useMemo(
    () =>
      sections.map((s) => ({
        key: s.key,
        data: s.data,
        backgroundColor: s.backgroundColor,
        minHeight: s.minHeight,
      })),
    [sections],
  );

  // Build and manage multi-section tree (pure data structure)
  const {
    tree,
    expansionVersion,
    handleToggleExpansion,
    handleToggleSectionExpansion,
  } = useMultiSectionTreeState({
    sectionConfigs,
    searchQuery,
    indentSizePx: theme.indentSize,
  });

  // Compute search matches
  const searchMatches = useMemo(() => {
    if (!searchQuery || !tree) return [];
    return searchInTree(tree, searchQuery, { caseSensitive: false });
  }, [tree, searchQuery]);

  // Calculate match counts for collapsed nodes and multi-match badges
  const matchCounts = useMemo(() => {
    return tree && searchMatches.length > 0
      ? getMatchCountsPerNode(tree, searchMatches)
      : undefined;
  }, [tree, searchMatches]);

  // Notify parent of search result count
  useEffect(() => {
    if (onSearchResults) {
      onSearchResults(searchMatches.length);
    }
  }, [searchMatches, onSearchResults]);

  // Determine virtualization (auto-detect based on total nodes)
  const shouldVirtualize = useMemo(() => {
    if (virtualizedProp !== undefined) return virtualizedProp;
    if (!tree) return false;
    return tree.totalNodeCount > 500;
  }, [virtualizedProp, tree]);

  // Common viewer props (includes both data tree and presentation sections)
  const viewerProps = useMemo(
    () => ({
      tree,
      sections,
      expansionVersion,
      theme,
      defaultRenderHeader,
      searchQuery,
      currentMatchIndex,
      matchCounts,
      showLineNumbers,
      enableCopy,
      stringWrapMode,
      truncateStringsAt,
      onToggleExpansion: handleToggleExpansion,
      scrollContainerRef,
    }),
    [
      tree,
      sections,
      expansionVersion,
      theme,
      defaultRenderHeader,
      searchQuery,
      currentMatchIndex,
      matchCounts,
      showLineNumbers,
      enableCopy,
      stringWrapMode,
      truncateStringsAt,
      handleToggleExpansion,
      scrollContainerRef,
    ],
  );

  if (!tree) {
    return <div className={className}>Building tree...</div>;
  }

  return (
    <SectionContextProvider tree={tree} onToggle={handleToggleSectionExpansion}>
      <div
        className={className}
        style={{
          display: "flex",
          flexDirection: "column",
          ...(shouldVirtualize && { height: "100%" }),
        }}
      >
        {shouldVirtualize ? (
          <VirtualizedMultiSectionViewer {...viewerProps} />
        ) : (
          <SimpleMultiSectionViewer {...viewerProps} />
        )}
      </div>
    </SectionContextProvider>
  );
}
