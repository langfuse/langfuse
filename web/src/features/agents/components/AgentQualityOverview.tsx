import { useMemo } from "react";
import { StringParam, useQueryParam } from "use-query-params";
import {
  type AgentDetailInput,
  type AgentQualityScore,
} from "@langfuse/shared/agents";
import { api } from "@/src/utils/api";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Table } from "@/src/components/design-system/table/Table";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { createNumberTableColumn } from "@/src/components/design-system/table/columns/createNumberTableColumn";
import {
  agentQualityKey,
  agentQualityOptions,
  prepareAgentQuality,
} from "../lib/agentQuality";
import { AgentOverviewChart } from "./AgentOverviewChart";
import { AgentQueryError } from "./AgentQueryError";
import { type AgentOverviewSync } from "../lib/agentOverview";

export function AgentQualityOverview({
  input,
  sync,
}: {
  input: AgentDetailInput;
  sync: AgentOverviewSync;
}) {
  const capture = usePostHogClientCapture();
  const options = api.agents.qualityOptions.useQuery(input);
  const [selectedKey, setSelectedKey] = useQueryParam(
    "qualityScore",
    StringParam,
  );
  const scores = options.data?.items ?? [];
  const selected = selectedKey
    ? scores.find((score) => agentQualityKey(score) === selectedKey)
    : scores[0];
  return (
    <section className="ph-no-capture flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-base font-bold">Quality and models</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Compare evaluations recorded on this agent’s runs over time and by
            model.
          </p>
        </div>
        {scores.length > 0 && (
          <div className="w-full sm:w-80">
            <SelectInput
              aria-label="Quality score"
              value={selected ? agentQualityKey(selected) : ""}
              onValueChange={(next) => {
                if (selected && next === agentQualityKey(selected)) return;
                const score = scores.find(
                  (item) => agentQualityKey(item) === next,
                );
                if (!score) return;
                capture("agents:quality_score_selected", {
                  dataType: score.dataType,
                  source: score.source,
                  hasConfig: score.configId !== null,
                  isV4: true,
                });
                setSelectedKey(next);
              }}
              options={agentQualityOptions(scores)}
              placeholder="Choose a quality score"
              search={{ placeholder: "Find a score" }}
              noCapture
            />
          </div>
        )}
      </div>
      {options.isPending && (
        <Skeleton className="h-64 motion-reduce:animate-none" />
      )}
      {options.isError && (
        <AgentQueryError
          retry={() => {
            options.refetch();
          }}
        />
      )}
      {options.isSuccess && scores.length === 0 && (
        <p className="text-muted-foreground rounded-lg border p-6 text-sm">
          No numeric or boolean scores were recorded directly on this agent’s
          runs. Add run-level evaluations or annotations to compare quality
          here.
        </p>
      )}
      {options.isSuccess && scores.length > 0 && !selected && (
        <p className="text-muted-foreground text-sm">
          The selected score is unavailable in this period. Choose another
          score.
        </p>
      )}
      {options.isSuccess && selected && (
        <AgentQualityResult input={input} score={selected} sync={sync} />
      )}
      {options.data?.hasMore && (
        <p className="text-muted-foreground text-xs">
          Showing the first {scores.length} observed scores. Narrow the period
          or environment to find another score.
        </p>
      )}
    </section>
  );
}

function AgentQualityResult({
  input,
  score,
  sync,
}: {
  input: AgentDetailInput;
  score: AgentQualityScore;
  sync: AgentOverviewSync;
}) {
  const query = api.agents.quality.useQuery({ ...input, score });
  const prepared = useMemo(
    () => (query.data ? prepareAgentQuality(query.data) : null),
    [query.data],
  );
  if (query.isError)
    return (
      <AgentQueryError
        retry={() => {
          query.refetch();
        }}
      />
    );
  if (!query.data || !prepared)
    return <Skeleton className="h-64 motion-reduce:animate-none" />;
  type ModelRow = (typeof prepared.models)[number];
  const columns = [
    createTextTableColumn<ModelRow>({
      accessorKey: "name",
      header: "Model group",
      size: 240,
    }),
    createTextTableColumn<ModelRow>({
      accessorKey: "average",
      header: "Selected period",
      size: 130,
    }),
    createTextTableColumn<ModelRow>({
      accessorKey: "previous",
      header: "Previous period",
      size: 130,
    }),
    createNumberTableColumn<ModelRow>({
      accessorKey: "scoredRuns",
      header: "Scored runs",
      size: 120,
      formatter: (value) => value.toLocaleString(),
    }),
    createTextTableColumn<ModelRow>({
      accessorKey: "coverage",
      header: "Coverage",
      size: 180,
    }),
  ];
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <AgentOverviewChart chart={prepared.chart} sync={sync} />
      <p className="text-muted-foreground text-xs">
        {query.data.current.scoredRuns.toLocaleString()} of{" "}
        {query.data.current.totalRuns.toLocaleString()} agent runs have this
        score. Scores use their latest known value and can arrive after a run
        completes.
      </p>
      <div className="max-h-80 overflow-auto rounded-lg border">
        <Table
          tableName="Quality by model"
          columns={columns}
          data={{ status: "success", data: prepared.models }}
          rowHeight="s"
          topBorder={false}
          noResultsMessage="No scored model groups in this period"
        />
      </div>
      {query.data.hasMoreModels && (
        <p className="text-muted-foreground text-xs">
          Showing {prepared.models.length} model groups. Narrow the period to
          inspect more.
        </p>
      )}
    </div>
  );
}
