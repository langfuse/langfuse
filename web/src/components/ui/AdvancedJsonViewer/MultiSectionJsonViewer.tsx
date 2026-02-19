import {
  useMemo,
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
  type RefObject,
} from "react";
import type {
  JsonSection,
  PartialJSONTheme,
  StringWrapMode,
  SectionContext,
  ExpansionState,
} from "./types";
import { useMultiSectionTreeState } from "./hooks/useMultiSectionTreeState";
import { useJsonTheme } from "./hooks/useJsonTheme";
import {
  VirtualizedMultiSectionViewer,
  type VirtualizedMultiSectionViewerHandle,
} from "./VirtualizedMultiSectionViewer";
import {
  SimpleMultiSectionViewer,
  type SimpleMultiSectionViewerHandle,
} from "./SimpleMultiSectionViewer";
import { SectionContextProvider } from "./contexts/SectionContext";
import { searchInTree, getMatchCountsPerNode } from "./utils/searchJson";
import { type MediaReturnType } from "@/src/features/media/validation";
import { type CommentedPathsByField } from "./utils/commentRanges";

export interface MultiSectionJsonViewerHandle {
  scrollToSection: (sectionKey: string) => void;
}

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

  /** Media attachments (will be filtered by section field) */
  media?: MediaReturnType[];

  /** Comment highlight ranges per field (for inline comments feature) */
  commentedPathsByField?: CommentedPathsByField;

  /** External expansion state for persistence */
  // Input accepts ExpansionState (boolean shorthand), callback receives Record (what exportExpansionState emits)
  externalExpansionState?: ExpansionState;
  onExpansionChange?: (state: Record<string, boolean>) => void;
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
export const MultiSectionJsonViewer = forwardRef<
  MultiSectionJsonViewerHandle,
  MultiSectionJsonViewerProps
>(function MultiSectionJsonViewer(
  {
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
    media,
    commentedPathsByField,
    externalExpansionState,
    onExpansionChange,
  },
  ref,
) {
  // Ref for child viewer (either virtualized or simple)
  const viewerRef = useRef<
    VirtualizedMultiSectionViewerHandle | SimpleMultiSectionViewerHandle
  >(null);

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
        hasFooter: !!s.renderFooter,
        hideData: s.hideData,
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
    externalExpansionState,
    onExpansionChange,
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

  // Expose scrollToSection method via ref (forwards to child viewer)
  useImperativeHandle(
    ref,
    () => ({
      scrollToSection: (sectionKey: string) => {
        viewerRef.current?.scrollToSection(sectionKey);
      },
    }),
    [],
  );

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
      media,
      commentedPathsByField,
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
      media,
      commentedPathsByField,
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
          <VirtualizedMultiSectionViewer ref={viewerRef} {...viewerProps} />
        ) : (
          <SimpleMultiSectionViewer ref={viewerRef} {...viewerProps} />
        )}
      </div>
    </SectionContextProvider>
  );
});
