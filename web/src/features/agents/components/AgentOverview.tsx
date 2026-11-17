import { useMemo, useState } from "react";
import { type AgentDetailInput } from "@langfuse/shared/agents";
import { api } from "@/src/utils/api";
import { Skeleton } from "@/src/components/ui/skeleton";
import { AgentOverviewMetrics } from "./AgentOverviewMetrics";
import { AgentQualityOverview } from "./AgentQualityOverview";
import { AgentRelationshipsOverview } from "./AgentRelationshipsOverview";
import { AgentQueryError } from "./AgentQueryError";

export function AgentOverview({ input }: { input: AgentDetailInput }) {
  const overview = api.agents.overview.useQuery(input);
  const [activeKey, setActiveKey] = useState<string>();
  const sync = useMemo(
    () => ({ activeKey, onActiveKeyChange: setActiveKey }),
    [activeKey],
  );
  return (
    <div className="ph-no-capture flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto p-4">
      {overview.data && (
        <AgentOverviewMetrics result={overview.data} sync={sync} />
      )}
      {!overview.data && overview.isError && (
        <AgentQueryError
          retry={() => {
            overview.refetch();
          }}
        />
      )}
      {overview.isPending && (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-72 motion-reduce:animate-none" />
          ))}
        </div>
      )}
      {!overview.isPending && (
        <>
          <AgentQualityOverview input={input} sync={sync} />
          <AgentRelationshipsOverview input={input} />
        </>
      )}
    </div>
  );
}
