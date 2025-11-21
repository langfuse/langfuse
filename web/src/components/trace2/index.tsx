import { type ObservationLevelType, type TraceDomain } from "@langfuse/shared";
import { type UrlUpdateType } from "use-query-params";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import { type ScoreDomain } from "@langfuse/shared";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import { TraceDataProvider, useTraceData } from "./contexts/TraceDataContext";
import {
  ViewPreferencesProvider,
  useViewPreferences,
} from "./contexts/ViewPreferencesContext";
import { SelectionProvider, useSelection } from "./contexts/SelectionContext";

export type Trace2Props = {
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

export function Trace2(props: Trace2Props) {
  const { trace, observations, scores, defaultMinObservationLevel } = props;

  return (
    <TraceDataProvider
      trace={trace}
      observations={observations}
      scores={scores}
    >
      <ViewPreferencesProvider
        defaultMinObservationLevel={defaultMinObservationLevel}
      >
        <SelectionProvider>
          <Trace2Content />
        </SelectionProvider>
      </ViewPreferencesProvider>
    </TraceDataProvider>
  );
}

function Trace2Content() {
  const traceData = useTraceData();
  const viewPrefs = useViewPreferences();
  const selection = useSelection();

  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="text-center">
        <h2 className="text-lg font-semibold">Trace2 Component</h2>
        <p className="text-muted-foreground">
          Loaded {traceData.observations.length} observations for trace &quot;
          {traceData.trace.name ?? traceData.trace.id}&quot;
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Tree nodes: {traceData.nodeMap.size} | Search items:{" "}
          {traceData.searchItems.length}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Show duration: {viewPrefs.showDuration ? "yes" : "no"} | Selected:{" "}
          {selection.selectedNodeId ?? "none"}
        </p>
      </div>
    </div>
  );
}
