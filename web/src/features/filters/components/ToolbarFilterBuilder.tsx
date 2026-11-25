import { useState, type ComponentProps } from "react";
import { WandSparkles } from "@langfuse/icons";
import { singleFilter, type FilterState } from "@langfuse/shared";
import { Banner } from "@/src/components/design-system/Banner/Banner";
import { FilterBuilderDropdown } from "@/src/components/design-system/FilterBuilderDropdown/FilterBuilderDropdown";
import { type FilterBuilderColumn } from "@/src/components/design-system/ControlledFilterBuilderEditor/ControlledFilterBuilderEditor";
import { Button } from "@/src/components/ui/button";
import { Textarea } from "@/src/components/ui/textarea";
import { openAIFeaturesSettings } from "@/src/features/organizations/components/AIFeaturesDisabledNotice";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { useQueryProject } from "@/src/features/projects/hooks";
import { useFilterBuilderAnalytics } from "@/src/features/filters/hooks/useFilterBuilderAnalytics";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { api, reportNonTrpcError } from "@/src/utils/api";
import { getFilterSummaryTokens } from "./FilterSummary";

type ToolbarColumn = FilterBuilderColumn & {
  alert?: { severity: "info" | "warning" | "error"; message: string };
};

export function ToolbarFilterBuilder({
  columns,
  tableName,
  isV4,
  filterWithAI,
  ...props
}: Pick<ComponentProps<typeof FilterBuilderDropdown>, "value" | "onChange"> & {
  columns: ToolbarColumn[];
  tableName: string;
  isV4: boolean;
  filterWithAI?: boolean;
}) {
  const onAnalyticsEvent = useFilterBuilderAnalytics(tableName, isV4);
  const { isLangfuseCloud } = useLangfuseCloudRegion();

  return (
    <FilterBuilderDropdown
      {...props}
      columns={columns}
      variant="summary"
      summary={getFilterSummaryTokens(props.value)}
      responsiveSummary
      onAnalyticsEvent={onAnalyticsEvent}
      getColumnNotice={(column) =>
        columns.find(({ id }) => id === column.id)?.alert
      }
      renderAddon={
        filterWithAI && isLangfuseCloud
          ? ({ replaceFilters }) => (
              <AiFilterControls onGenerated={replaceFilters} />
            )
          : undefined
      }
    />
  );
}

function AiFilterControls({
  onGenerated,
}: {
  onGenerated: (filters: FilterState) => void;
}) {
  const projectId = useProjectIdFromURL();
  const { organization } = useQueryProject();
  const mutation = api.naturalLanguageFilters.createCompletion.useMutation();
  const [expanded, setExpanded] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string>();
  const enabled = organization?.aiFeaturesEnabled === true;
  const canGenerate =
    enabled && !!projectId && !!prompt.trim() && !mutation.isPending;

  const generate = async () => {
    if (!canGenerate || !projectId) return;
    setError(undefined);
    try {
      const result = await mutation.mutateAsync({
        projectId,
        prompt: prompt.trim(),
      });
      const filters = Array.isArray(result?.filters)
        ? result.filters.flatMap((filter) => {
            const parsed = singleFilter.safeParse(filter);
            return parsed.success ? [parsed.data] : [];
          })
        : [];
      if (!filters.length) {
        setError("Failed to generate filters, try again");
        return;
      }
      onGenerated(filters);
      setPrompt("");
      setExpanded(false);
    } catch (error) {
      reportNonTrpcError(error, "ai-filters");
      setError(
        error instanceof Error ? error.message : "Failed to generate filters",
      );
    }
  };

  return (
    <div className="grid gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={mutation.isPending || (!enabled && !organization?.id)}
        onClick={() => {
          if (!enabled && organization?.id) {
            openAIFeaturesSettings(organization.id);
            return;
          }
          setExpanded(!expanded);
        }}
      >
        <WandSparkles size="base" />
        {!enabled
          ? "AI Filters: Enable in Organization Settings (Admin Only)"
          : expanded
            ? "Cancel"
            : "Create Filter with AI"}
      </Button>
      {expanded && enabled && (
        <>
          <Textarea
            aria-label="Describe the filters you want to apply"
            placeholder="Describe the filters you want to apply..."
            value={prompt}
            disabled={mutation.isPending}
            onChange={(event) => {
              setPrompt(event.target.value);
              setError(undefined);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && event.ctrlKey) {
                event.preventDefault();
                void generate();
              }
            }}
          />
          <Button
            type="button"
            disabled={!canGenerate}
            onClick={() => void generate()}
          >
            {mutation.isPending ? "Loading..." : "Generate filters"}
          </Button>
          {error && <Banner variant="error">{error}</Banner>}
        </>
      )}
    </div>
  );
}
