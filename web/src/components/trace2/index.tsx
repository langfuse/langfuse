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
import { TraceTree } from "./components/TraceTree";

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

export function Trace(props: TraceProps) {
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
          <TraceContent />
        </SelectionProvider>
      </ViewPreferencesProvider>
    </TraceDataProvider>
  );
}

function TraceContent() {
  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex-1 overflow-hidden">
        <TraceTree />
      </div>
    </div>
  );
}
