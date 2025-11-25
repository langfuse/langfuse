import { type TraceDomain } from "@langfuse/shared";
import { type UrlUpdateType } from "use-query-params";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import { type ScoreDomain } from "@langfuse/shared";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import { TraceDataProvider } from "./contexts/TraceDataContext";
import {
  ViewPreferencesProvider,
  useViewPreferences,
} from "./contexts/ViewPreferencesContext";
import { SelectionProvider } from "./contexts/SelectionContext";
import { SearchProvider } from "./contexts/SearchContext";
import { TraceLayoutMobile } from "./components/_layout/TraceLayoutMobile";
import { TraceLayoutDesktop } from "./components/_layout/TraceLayoutDesktop";
import { TracePanelNavigation } from "./components/_layout/TracePanelNavigation";
import { TracePanelDetail } from "./components/_layout/TracePanelDetail";
import { TracePanelNavigationLayoutDesktop } from "./components/_layout/TracePanelNavigationLayoutDesktop";
import { TracePanelNavigationLayoutMobile } from "./components/_layout/TracePanelNavigationLayoutMobile";
import { useIsMobile } from "@/src/hooks/use-mobile";

import { useMemo } from "react";

export type TraceProps = {
  observations: Array<ObservationReturnTypeWithMetadata>;
  trace: Omit<WithStringifiedMetadata<TraceDomain>, "input" | "output"> & {
    input: string | null;
    output: string | null;
  };
  scores: WithStringifiedMetadata<ScoreDomain>[];
  projectId: string;
  viewType?: "detailed" | "focused";
  context?: "peek" | "fullscreen";
  isValidObservationId?: boolean;
  selectedTab?: string;
  setSelectedTab?: (
    newValue?: string | null,
    updateType?: UrlUpdateType,
  ) => void;
};

export function Trace({ trace, observations, scores }: TraceProps) {
  // TODO: Build comments map (empty for now - will be populated from API in future)
  const commentsMap = useMemo(() => new Map<string, number>(), []);

  return (
    <ViewPreferencesProvider>
      <TraceInternal
        trace={trace}
        observations={observations}
        scores={scores}
        commentsMap={commentsMap}
      />
    </ViewPreferencesProvider>
  );
}

interface TraceInternalProps {
  trace: TraceProps["trace"];
  observations: TraceProps["observations"];
  scores: TraceProps["scores"];
  commentsMap: Map<string, number>;
}

/**
 * TraceInternal - Internal component that bridges ViewPreferencesContext and TraceDataProvider
 *
 * Purpose:
 * - Consumes ViewPreferencesContext to get minObservationLevel
 * - Passes minObservationLevel to TraceDataProvider
 * - Wraps with remaining context providers (TraceData, Selection, Search)
 *
 * Why it exists:
 * - React hooks rules: Cannot call useViewPreferences() in the same component
 *   that renders ViewPreferencesProvider (the parent Trace component)
 * - Acts as a bridge between provider layers
 */
function TraceInternal({
  trace,
  observations,
  scores,
  commentsMap,
}: TraceInternalProps) {
  const { minObservationLevel } = useViewPreferences();

  return (
    <TraceDataProvider
      trace={trace}
      observations={observations}
      scores={scores}
      comments={commentsMap}
      minObservationLevel={minObservationLevel}
    >
      <SelectionProvider>
        <SearchProvider>
          <TraceContent />
        </SearchProvider>
      </SelectionProvider>
    </TraceDataProvider>
  );
}

/**
 * TraceContent - Platform detection and routing component
 *
 * Purpose:
 * - Detects mobile vs desktop viewport
 * - Routes to appropriate platform-specific implementation
 *
 * Hooks:
 * - useIsMobile() - for responsive platform detection
 */
function TraceContent() {
  const isMobile = useIsMobile();
  return isMobile ? <MobileTraceContent /> : <DesktopTraceContent />;
}

/**
 * DesktopTraceContent - Desktop layout composition
 *
 * Purpose:
 * - Composes desktop-specific layout structure
 * - Horizontal resizable panels with collapse functionality
 * - Navigation panel (left) + Detail panel (right)
 */
function DesktopTraceContent() {
  return (
    <TraceLayoutDesktop>
      <TraceLayoutDesktop.NavigationPanel>
        <TracePanelNavigationLayoutDesktop>
          <TracePanelNavigation />
        </TracePanelNavigationLayoutDesktop>
      </TraceLayoutDesktop.NavigationPanel>
      <TraceLayoutDesktop.ResizeHandle />
      <TraceLayoutDesktop.DetailPanel>
        <TracePanelDetail />
      </TraceLayoutDesktop.DetailPanel>
    </TraceLayoutDesktop>
  );
}

/**
 * MobileTraceContent - Mobile layout composition
 *
 * Purpose:
 * - Composes mobile-specific layout structure
 * - Vertical accordion-style panels
 * - Navigation panel (top, collapsible) + Detail panel (bottom)
 */
function MobileTraceContent() {
  return (
    <div className="h-full w-full">
      <TraceLayoutMobile>
        <TraceLayoutMobile.NavigationPanel>
          <TracePanelNavigationLayoutMobile>
            <TracePanelNavigation />
          </TracePanelNavigationLayoutMobile>
        </TraceLayoutMobile.NavigationPanel>
        <TraceLayoutMobile.DetailPanel>
          <TracePanelDetail />
        </TraceLayoutMobile.DetailPanel>
      </TraceLayoutMobile>
    </div>
  );
}
