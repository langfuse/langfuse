import { useRef, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { api, type RouterOutputs } from "@/src/utils/api";
import {
  topicExecutionInputSchema,
  type TopicFacet,
  type TopicOperation,
} from "@langfuse/shared/topics";
import { TopicTraceSelector } from "./TopicTraceSelector";

type Run = RouterOutputs["topics"]["runs"][number];
type Execution = RouterOutputs["topics"]["execution"];

export function TopicPipelineForm({
  projectId,
  facets,
  runs,
  executions,
  canWrite,
  onTriggered,
}: {
  projectId: string;
  facets: TopicFacet[];
  runs: Run[];
  executions: Execution[];
  canWrite: boolean;
  onTriggered: (id: string) => void;
}) {
  const [operation, setOperation] = useState<TopicOperation>("discover");
  const [selectedFacetIds, setSelectedFacetIds] = useState<string[]>(() =>
    facets
      .filter((facet) => facet.versions.length > 0)
      .map((facet) => facet.id),
  );
  const [facetVersions, setFacetVersions] = useState<Record<string, string>>(
    () =>
      Object.fromEntries(
        facets.map((facet) => [facet.id, facet.versions[0]?.id ?? ""]),
      ),
  );
  const [targetRunIds, setTargetRunIds] = useState<Record<string, string>>({});
  const [sourceExecutionIds, setSourceExecutionIds] = useState<string[]>([]);
  const [exploratory, setExploratory] = useState(false);
  const [budget, setBudget] = useState("0.25");
  const [error, setError] = useState<string | null>(null);
  const request = useRef<{ key: string; id: string } | null>(null);
  const trigger = api.topics.trigger.useMutation();
  const utils = api.useUtils();
  const facetChoices = facets.flatMap((facet) => {
    const version =
      facet.versions.find(
        (version) => version.id === facetVersions[facet.id],
      ) ?? facet.versions[0];
    return version
      ? [{ facet, version, selected: selectedFacetIds.includes(facet.id) }]
      : [];
  });
  const facetVersionIds = facetChoices
    .filter((choice) => choice.selected)
    .map((choice) => choice.version.id);
  const reclusterSources = executions.filter(
    (execution) =>
      ["completed", "completed_with_errors"].includes(execution.status) &&
      facetVersionIds.every((id) =>
        execution.facets.some((facet) => facet.facetVersionId === id),
      ),
  );
  const selectedSourceIds = sourceExecutionIds.filter((id) =>
    reclusterSources.some((execution) => execution.id === id),
  );
  const toggleFacet = (id: string, checked: boolean) =>
    setSelectedFacetIds((current) =>
      checked ? [...current, id] : current.filter((item) => item !== id),
    );
  async function submit(traceIds: string[] | null) {
    setError(null);
    try {
      if (!facetVersionIds.length)
        throw new Error("Select at least one facet.");
      if (operation !== "recluster" && !traceIds?.length)
        throw new Error("Preview and select traces before running Topics.");
      const base = {
        projectId,
        facetVersionIds,
        budgetUsd: Number(budget),
        exploratory,
      };
      const values =
        operation === "recluster"
          ? { ...base, operation, sourceExecutionIds: selectedSourceIds }
          : operation === "assign"
            ? {
                ...base,
                operation,
                traceIds,
                targetRunIds,
              }
            : {
                ...base,
                operation,
                traceIds,
              };
      const key = JSON.stringify(values);
      if (request.current?.key !== key)
        request.current = { key, id: crypto.randomUUID() };
      const result = await trigger.mutateAsync(
        topicExecutionInputSchema.parse({
          ...values,
          requestId: request.current.id,
        }),
      );
      request.current = null;
      onTriggered(result.id);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not trigger the pipeline.",
      );
    }
  }
  const renderConfiguration = (traceIds: string[] | null) => (
    <>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-bold">Facets</legend>
        {facetChoices.map(({ facet, version, selected }) => (
          <div
            key={facet.id}
            className="bg-muted/30 flex flex-col gap-2 rounded-md p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex min-w-0 items-center gap-2 text-sm font-bold">
                <Checkbox
                  checked={selected}
                  onCheckedChange={(value) =>
                    toggleFacet(facet.id, value === true)
                  }
                />
                {facet.name}
              </label>
              <Select
                value={version.id}
                onValueChange={(value) =>
                  setFacetVersions((current) => ({
                    ...current,
                    [facet.id]: value,
                  }))
                }
              >
                <SelectTrigger
                  className="w-24"
                  aria-label={`Version for ${facet.name}`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="ph-no-capture">
                  {facet.versions.map((candidate) => (
                    <SelectItem key={candidate.id} value={candidate.id}>
                      v{candidate.version}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-muted-foreground text-sm">{version.prompt}</p>
            <p className="text-muted-foreground text-xs">
              {version.processingConfig.embeddingDimensions} embedding
              dimensions
            </p>
            {operation === "assign" && selected && (
              <Select
                value={targetRunIds[version.id] ?? ""}
                onValueChange={(value) =>
                  setTargetRunIds((current) => ({
                    ...current,
                    [version.id]: value,
                  }))
                }
              >
                <SelectTrigger
                  className="w-full sm:w-64"
                  aria-label={`Map for ${facet.name} v${version.version}`}
                >
                  <SelectValue placeholder="Select published map" />
                </SelectTrigger>
                <SelectContent className="ph-no-capture">
                  {runs
                    .filter(
                      (run) =>
                        run.facetVersionId === version.id && run.publishedAt,
                    )
                    .map((run) => (
                      <SelectItem key={run.id} value={run.id}>
                        Map {run.runSequence} · {run.topics.length} topics
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
          </div>
        ))}
      </fieldset>
      {operation === "recluster" && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-bold">
            Completed batches to combine
          </legend>
          {reclusterSources.map((execution) => (
            <label
              key={execution.id}
              className="flex items-center gap-2 text-sm"
            >
              <Checkbox
                checked={sourceExecutionIds.includes(execution.id)}
                onCheckedChange={(checked) =>
                  setSourceExecutionIds((current) =>
                    checked
                      ? [...current, execution.id]
                      : current.filter((id) => id !== execution.id),
                  )
                }
              />
              {execution.input.operation} ·{" "}
              {new Date(execution.createdAt).toLocaleString()}
            </label>
          ))}
          <p className="text-muted-foreground text-xs">
            Only completed batches containing every selected facet version are
            shown. Reuses retained summaries and embeddings; naming can make a
            model call.
          </p>
          {reclusterSources.length === 0 && (
            <p className="text-sm">
              No compatible batches. Select the facet versions used by a
              previous batch, or discover topics with new traces first.
            </p>
          )}
        </fieldset>
      )}
      <div className="flex flex-wrap items-end gap-5">
        {operation !== "assign" && (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={exploratory}
              onCheckedChange={(value) => setExploratory(value === true)}
            />
            Small sample mode (10+ summaries; provisional topics)
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm">
          Execution budget (USD)
          <Input
            aria-label="Execution budget (USD)"
            type="number"
            min="0.001"
            max="0.25"
            step="0.01"
            className="w-28"
            value={budget}
            onChange={(event) => setBudget(event.target.value)}
          />
        </label>
        <Button
          disabled={
            !canWrite ||
            trigger.isPending ||
            !facetVersionIds.length ||
            (operation === "recluster"
              ? !selectedSourceIds.length
              : !traceIds?.length) ||
            (operation === "assign" &&
              facetVersionIds.some((id) => !targetRunIds[id]))
          }
          onClick={() => submit(traceIds)}
        >
          {trigger.isPending ? "Triggering…" : "Trigger pipeline"}
        </Button>
      </div>
      {operation !== "recluster" && traceIds?.length ? (
        <p className="text-muted-foreground text-sm">
          Run on {traceIds.length} selected traces across{" "}
          {facetVersionIds.length} facets. Existing summaries are reused when
          their inputs match. Uncached inputs and outputs are sent to OpenAI.
          The aggregate $0.25 validation budget still applies.
        </p>
      ) : null}
      {operation === "discover" && !exploratory && (
        <p className="text-muted-foreground text-xs">
          Standard discovery requires 100 usable summaries per facet. Smaller
          batches still produce inspectable summaries.
        </p>
      )}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </>
  );
  return (
    <section className="flex flex-col gap-5 border-t pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-bold">Run the pipeline</h2>
        <Select
          value={operation}
          onValueChange={(value) => {
            setOperation(value as TopicOperation);
            setError(null);
            if (value === "assign") utils.topics.runs.invalidate({ projectId });
            if (value === "recluster")
              utils.topics.executions.invalidate({ projectId });
          }}
        >
          <SelectTrigger className="w-64" aria-label="Pipeline operation">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="discover">Discover a new topic map</SelectItem>
            <SelectItem value="assign">
              Assign traces to an existing map
            </SelectItem>
            <SelectItem value="recluster">
              Recluster cached summaries
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      {operation === "recluster" ? (
        renderConfiguration(null)
      ) : (
        <TopicTraceSelector projectId={projectId}>
          {renderConfiguration}
        </TopicTraceSelector>
      )}
    </section>
  );
}
