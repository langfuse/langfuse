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
  topicEmbeddingConfigSchema,
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
  const [operation, setOperation] = useState<TopicOperation>("refresh");
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
  const [dimensions, setDimensions] = useState("768");
  const [forceRefresh, setForceRefresh] = useState(false);
  const embeddingConfig = topicEmbeddingConfigSchema.safeParse({
    embeddingDimensions: Number(dimensions),
  });
  const currentResults = api.topics.currentResults.useQuery({ projectId });
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
  const retainedCohort =
    currentResults.data &&
    facetVersionIds.every((id) =>
      currentResults.data.some((facet) => facet.facetVersionId === id),
    )
      ? new Set(
          currentResults.data
            .filter((facet) =>
              facetVersionIds.includes(facet.facetVersionId ?? ""),
            )
            .flatMap((facet) => facet.retainedTraceIds),
        )
      : null;
  const compatibleRuns = runs.filter(
    (run) =>
      run.publishedAt &&
      run.embeddingConfig?.embeddingDimensions === Number(dimensions) &&
      run.embeddingConfig.embeddingModel ===
        embeddingConfig.data?.embeddingModel,
  );
  const selectedTargetRunIds = Object.fromEntries(
    facetVersionIds.flatMap((id) =>
      compatibleRuns.some(
        (run) => run.facetVersionId === id && run.id === targetRunIds[id],
      )
        ? [[id, targetRunIds[id]!]]
        : [],
    ),
  );
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
        exploratory,
        forceRefresh: operation === "refresh" && forceRefresh,
        embeddingConfig: topicEmbeddingConfigSchema.parse({
          embeddingDimensions: Number(dimensions),
        }),
      };
      const values =
        operation === "recluster"
          ? { ...base, operation, sourceExecutionIds: selectedSourceIds }
          : operation === "assign"
            ? {
                ...base,
                operation,
                traceIds,
                targetRunIds: selectedTargetRunIds,
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
            {operation === "assign" && selected && (
              <Select
                value={selectedTargetRunIds[version.id] ?? ""}
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
                  <SelectValue placeholder="Select compatible published map" />
                </SelectTrigger>
                <SelectContent className="ph-no-capture">
                  {compatibleRuns
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
        <label className="flex flex-col gap-1 text-sm">
          Embedding dimensions
          <Input
            aria-label="Embedding dimensions"
            className="w-28"
            type="number"
            min={16}
            max={1536}
            step={1}
            value={dimensions}
            onChange={(event) => setDimensions(event.target.value)}
          />
        </label>
        {operation === "refresh" && (
          <label className="flex h-8 items-center gap-2 text-sm">
            <Checkbox
              checked={forceRefresh}
              onCheckedChange={(value) => setForceRefresh(value === true)}
            />
            Force refresh
          </label>
        )}
        {operation !== "assign" && (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={exploratory}
              onCheckedChange={(value) => setExploratory(value === true)}
            />
            Small sample mode (10+ summaries; provisional topics)
          </label>
        )}
        <Button
          disabled={
            !canWrite ||
            !embeddingConfig.success ||
            trigger.isPending ||
            !facetVersionIds.length ||
            (operation === "recluster"
              ? !selectedSourceIds.length
              : !traceIds?.length) ||
            (operation === "assign" &&
              facetVersionIds.some((id) => !selectedTargetRunIds[id]))
          }
          onClick={() => submit(traceIds)}
        >
          {trigger.isPending ? "Starting…" : "Run topics"}
        </Button>
      </div>
      {operation !== "recluster" && traceIds?.length ? (
        <p className="text-muted-foreground text-sm">
          Run on {traceIds.length.toLocaleString()} traces across{" "}
          {facetVersionIds.length} facets. Existing summaries are reused when
          their inputs match. Uncached inputs and outputs are sent to OpenAI.
        </p>
      ) : null}
      {operation === "refresh" && (
        <p className="text-muted-foreground text-xs">
          Selected traces join the existing cohort. Topics refresh when the
          cohort changes enough; force refresh rebuilds the map from cached
          summaries.
          {retainedCohort &&
            ` ${retainedCohort.size.toLocaleString()} previously processed traces across the selected facet versions.`}
        </p>
      )}
      {(operation === "discover" || operation === "refresh") &&
        !exploratory && (
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
          <SelectContent className="ph-no-capture">
            <SelectItem value="refresh">Update topics</SelectItem>
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
