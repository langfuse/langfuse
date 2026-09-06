import { createContext, useMemo } from "react";
import type { SectionContext } from "../types";
import type { TreeState } from "../utils/treeStructure";
import { getSectionContext, getSectionKeys } from "../utils/multiSectionTree";

/**
 * Map of section contexts by sectionKey
 */
interface SectionContextMap {
  [sectionKey: string]: SectionContext;
}

const SectionContextMapContext = createContext<SectionContextMap>({});

export interface SectionContextProviderProps {
  tree: TreeState;
  onToggle: (sectionKey: string) => void;
  children: React.ReactNode;
}

/**
 * Provides section context to header/footer components
 */
export function SectionContextProvider({
  tree,
  onToggle,
  children,
}: SectionContextProviderProps) {
  const contextMap = useMemo(() => {
    const map: SectionContextMap = {};
    const sectionKeys = getSectionKeys(tree);

    sectionKeys.forEach((sectionKey) => {
      const context = getSectionContext(tree, sectionKey);

      map[sectionKey] = {
        sectionKey,
        rowCount: context.rowCount,
        isExpanded: context.isExpanded,
        setExpanded: (expanded: boolean) => {
          if (expanded !== context.isExpanded) {
            onToggle(sectionKey);
          }
        },
      };
    });

    return map;
  }, [tree, onToggle]);

  return (
    <SectionContextMapContext.Provider value={contextMap}>
      {children}
    </SectionContextMapContext.Provider>
  );
}
