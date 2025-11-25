import { type ObservationLevelType, type TraceDomain } from "@langfuse/shared";
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
  defaultMinObservationLevel?: ObservationLevelType;
  selectedTab?: string;
  setSelectedTab?: (
    newValue?: string | null,
    updateType?: UrlUpdateType,
  ) => void;
};

export function Trace({
  trace,
  observations,
  scores,
  defaultMinObservationLevel,
}: TraceProps) {
  // TODO: Build comments map (empty for now - will be populated from API in future)
  const commentsMap = useMemo(() => new Map<string, number>(), []);

  return (
    <ViewPreferencesProvider
      defaultMinObservationLevel={defaultMinObservationLevel}
    >
      <TraceWithPreferences
        trace={trace}
        observations={observations}
        scores={scores}
        commentsMap={commentsMap}
      />
    </ViewPreferencesProvider>
  );
}

interface TraceWithPreferencesProps {
  trace: TraceProps["trace"];
  observations: TraceProps["observations"];
  scores: TraceProps["scores"];
  commentsMap: Map<string, number>;
}

function TraceWithPreferences({
  trace,
  observations,
  scores,
  commentsMap,
}: TraceWithPreferencesProps) {
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

function TraceContent() {
  const isMobile = useIsMobile();

  return isMobile ? <MobileTraceContent /> : <DesktopTraceContent />;
}

function DesktopTraceContent() {
  return (
    <TraceLayoutDesktop>
      <TraceLayoutDesktop.Navigation>
        <TracePanelNavigationLayoutDesktop>
          <TracePanelNavigation />
        </TracePanelNavigationLayoutDesktop>
      </TraceLayoutDesktop.Navigation>
      <TraceLayoutDesktop.ResizeHandle />
      <TraceLayoutDesktop.Detail>
        <TracePanelDetail />
      </TraceLayoutDesktop.Detail>
    </TraceLayoutDesktop>
  );
}

function MobileTraceContent() {
  return (
    <div className="h-full w-full">
      <TraceLayoutMobile>
        <TraceLayoutMobile.Navigation>
          <TracePanelNavigationLayoutMobile>
            <TracePanelNavigation />
          </TracePanelNavigationLayoutMobile>
        </TraceLayoutMobile.Navigation>
        <TraceLayoutMobile.Detail>
          <TracePanelDetail />
        </TraceLayoutMobile.Detail>
      </TraceLayoutMobile>
    </div>
  );
}
