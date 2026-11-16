import { useForm } from "react-hook-form";
import type { FilterState } from "@langfuse/shared";
import {
  topicRuleFilterError,
  type TopicFacet,
  type TopicRule,
} from "@langfuse/shared/topics";
import { api } from "@/src/utils/api";
import { TOPIC_SETUP_BACKFILL_DAYS } from "./topic-setup-flow";
import { useTopicTraceFilter } from "./useTopicTraceFilter";
import { TopicRuleDialogView } from "./TopicRuleDialogView";

type TopicRuleForm = {
  name: string;
  filter: FilterState;
  facetIds: string[];
  samplingPercent: number;
  paused: boolean;
};

/** Edits a map: filter, facets, live updates, sample rate and name. */
export function TopicRuleDialog({
  projectId,
  facets,
  rule,
  closeDialog,
}: {
  projectId: string;
  facets: TopicFacet[];
  rule: TopicRule;
  closeDialog: () => void;
}) {
  const form = useForm<TopicRuleForm>({
    defaultValues: {
      name: rule.name,
      filter: rule.filter,
      facetIds: rule.facetIds,
      samplingPercent: Math.round(rule.sampling * 1000) / 10,
      paused: rule.enabled === false,
    },
  });
  const { name, filter, facetIds, samplingPercent, paused } = form.watch();
  // The same rule filter, suggestions and matching-traces preview as setup.
  const traceFilter = useTopicTraceFilter({
    projectId,
    active: true,
    filters: filter,
    onFiltersChange: (next) => form.setValue("filter", next),
  });
  const utils = api.useUtils();
  const setEnabled = api.topics.setRuleEnabled.useMutation({
    onSuccess: () => utils.topics.maps.invalidate({ projectId }),
  });
  const save = api.topics.saveRule.useMutation({
    // Questions decide the page's tabs and trace lists, so refresh those too.
    onSuccess: () =>
      Promise.all([
        utils.topics.maps.invalidate({ projectId }),
        utils.topics.rules.invalidate({ projectId }),
        utils.topics.currentResults.invalidate({ projectId }),
        utils.topics.traces.invalidate({ projectId }),
      ]),
  });
  const filterError = topicRuleFilterError(filter);
  const traceCounts = api.topics.setupTraceCounts.useQuery(
    { projectId, filter },
    { enabled: !paused && !filterError, retry: false },
  );
  const dailyTraces = traceCounts.data
    ? traceCounts.data.finished7d / TOPIC_SETUP_BACKFILL_DAYS
    : null;

  async function submit(values: TopicRuleForm) {
    await save.mutateAsync({
      projectId,
      id: rule.id,
      name: values.name.trim(),
      filter: values.filter,
      facetIds: values.facetIds,
      sampling: values.samplingPercent / 100,
    });
    if (values.paused !== (rule.enabled === false))
      await setEnabled.mutateAsync({
        projectId,
        id: rule.id,
        enabled: !values.paused,
      });
    closeDialog();
  }

  return (
    <TopicRuleDialogView
      projectId={projectId}
      facets={facets}
      name={name}
      onNameChange={(next) => form.setValue("name", next)}
      filter={filter}
      onFilterChange={(next) => form.setValue("filter", next)}
      traceFilter={traceFilter}
      filterError={filterError}
      facetIds={facetIds}
      onFacetIdsChange={(next) => form.setValue("facetIds", next)}
      paused={paused}
      onPausedChange={(next) => form.setValue("paused", next)}
      samplingPercent={samplingPercent}
      onSamplingPercentChange={(next) => form.setValue("samplingPercent", next)}
      dailyTraces={dailyTraces}
      canSave={
        name.trim().length > 0 && traceFilter.ready && facetIds.length > 0
      }
      saving={save.isPending || setEnabled.isPending}
      saveError={(save.error ?? setEnabled.error)?.message ?? null}
      onSave={() => {
        form
          .handleSubmit(submit)()
          .catch(() => undefined);
      }}
    />
  );
}
