import { useForm } from "react-hook-form";
import type { FilterState } from "@langfuse/shared";
import { topicRuleFilterError, type TopicFacet } from "@langfuse/shared/topics";
import { api } from "@/src/utils/api";
import {
  TOPIC_SETUP_BACKFILL_DAYS,
  TOPIC_SETUP_BACKFILL_LIMIT,
} from "./topic-setup-flow";
import { TopicCostEstimate } from "./TopicCostEstimate";
import { TopicSliceFields } from "./TopicSliceFields";
import { TopicTraceFilterSection } from "./TopicTraceFilterSection";
import { useTopicTraceFilter } from "./useTopicTraceFilter";
import { useTopicsCapture } from "./useTopicsCapture";
import { NewMapDialogView } from "./NewMapDialogView";

type NewMapForm = {
  name: string;
  filter: FilterState;
  facetIds: string[];
  samplingPercent: number;
};

/** Creates a map (a Topics rule) and starts its setup, which builds the first topics. */
export function NewMapDialog({
  projectId,
  facets,
  disabledReason,
  onCreated,
  closeDialog,
}: {
  projectId: string;
  facets: TopicFacet[];
  disabledReason?: string;
  onCreated: (ruleId: string) => void;
  closeDialog: () => void;
}) {
  const form = useForm<NewMapForm>({
    defaultValues: {
      name: "",
      filter: [],
      facetIds: facets.map(({ id }) => id),
      samplingPercent: 100,
    },
  });
  const { name, filter, facetIds, samplingPercent } = form.watch();
  const setFilter = (next: FilterState) => form.setValue("filter", next);
  const utils = api.useUtils();
  const capture = useTopicsCapture();

  const traceFilter = useTopicTraceFilter({
    projectId,
    active: true,
    filters: filter,
    onFiltersChange: setFilter,
  });
  const filterError = topicRuleFilterError(filter);
  const traceCounts = api.topics.setupTraceCounts.useQuery(
    { projectId, filter },
    { enabled: !filterError, retry: false },
  );
  const createRule = api.topics.saveRule.useMutation({
    onSuccess: () =>
      Promise.all([
        utils.topics.maps.invalidate({ projectId }),
        utils.topics.ruleMapCosts.invalidate(
          { projectId },
          { refetchType: "none" },
        ),
      ]),
  });
  const startRuleSetup = api.topics.startRuleSetup.useMutation({
    onSuccess: () => utils.topics.ruleSetupStatus.invalidate({ projectId }),
  });

  async function submit(values: NewMapForm) {
    const rule = await createRule.mutateAsync({
      projectId,
      name: values.name.trim(),
      filter: values.filter,
      facetIds: values.facetIds,
      sampling: values.samplingPercent / 100,
    });
    capture("topics:map_created", {
      filterCount: values.filter.length,
      facetCount: values.facetIds.length,
      samplePercent: values.samplingPercent,
    });
    // The rule exists either way: the error toast reports a failed start,
    // and the page then shows the rule's building state.
    await startRuleSetup
      .mutateAsync({ projectId, ruleId: rule.id })
      .catch(() => null);
    closeDialog();
    onCreated(rule.id);
  }

  return (
    <NewMapDialogView
      name={name}
      onNameChange={(next) => form.setValue("name", next)}
      filterField={
        <TopicTraceFilterSection
          projectId={projectId}
          filters={filter}
          onFiltersChange={setFilter}
          model={traceFilter}
        />
      }
      facets={facets}
      facetIds={facetIds}
      onFacetIdsChange={(next) => form.setValue("facetIds", next)}
      disabledReason={disabledReason}
      samplingField={
        <TopicSliceFields.Sampling
          value={samplingPercent}
          onChange={(next) => form.setValue("samplingPercent", next)}
          dailyTraces={
            traceCounts.data
              ? traceCounts.data.finished7d / TOPIC_SETUP_BACKFILL_DAYS
              : null
          }
          tooltip="Share of new matching traces this map analyzes."
        />
      }
      costEstimateField={
        <TopicCostEstimate
          projectId={projectId}
          filter={filter}
          facetIds={filterError ? [] : facetIds}
          samplingPercent={samplingPercent}
          dailyTraces={
            traceCounts.data
              ? traceCounts.data.finished7d / TOPIC_SETUP_BACKFILL_DAYS
              : null
          }
          backfillTraces={
            traceCounts.data
              ? Math.min(
                  TOPIC_SETUP_BACKFILL_LIMIT,
                  traceCounts.data.finished30d,
                )
              : null
          }
          source="new_map"
        />
      }
      canStart={
        name.trim().length > 0 &&
        traceFilter.ready &&
        !filterError &&
        facetIds.length > 0
      }
      starting={createRule.isPending || startRuleSetup.isPending}
      errors={[
        filterError && filter.length ? filterError : null,
        createRule.error?.message ?? null,
      ].flatMap((message) => (message ? [message] : []))}
      onStart={() => {
        form
          .handleSubmit(submit)()
          .catch(() => undefined);
      }}
    />
  );
}
