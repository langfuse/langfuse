import { useState } from "react";
import {
  topicRuleFilterError,
  type TopicFacet,
  type TopicRule,
} from "@langfuse/shared/topics";
import { api } from "@/src/utils/api";
import { suggestTopicRuleName } from "./topic-maps";
import { TOPIC_SETUP_BACKFILL_DAYS } from "./topic-setup-flow";
import { useTopicTraceFilter } from "./useTopicTraceFilter";
import { TopicRuleDialogView } from "./TopicRuleDialogView";

/** Edits a live run: filter, questions, auto-analyze, sample rate and name. */
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
  const [filter, setFilter] = useState(rule.filter);
  // The same rule filter, suggestions and matching-traces preview as setup.
  const traceFilter = useTopicTraceFilter({
    projectId,
    active: true,
    filters: filter,
    onFiltersChange: setFilter,
  });
  const [facetIds, setFacetIds] = useState(rule.facetIds);
  const [samplingPercent, setSamplingPercent] = useState(
    String(Math.round(rule.sampling * 1000) / 10),
  );
  const [name, setName] = useState<string | null>(rule.name);
  const [paused, setPaused] = useState(rule.enabled === false);
  const utils = api.useUtils();
  const setEnabled = api.topics.setRuleEnabled.useMutation({
    onSuccess: () => utils.topics.maps.invalidate({ projectId }),
  });
  const save = api.topics.saveRule.useMutation({
    onSuccess: () =>
      Promise.all([
        utils.topics.maps.invalidate({ projectId }),
        utils.topics.rules.invalidate({ projectId }),
      ]),
  });
  const sampling = Number(samplingPercent) / 100;
  const samplingValid =
    samplingPercent.trim() !== "" &&
    Number.isFinite(sampling) &&
    sampling > 0 &&
    sampling <= 1;
  const filterError = topicRuleFilterError(filter);
  const ruleName = name ?? suggestTopicRuleName(filter);
  const traceCounts = api.topics.setupTraceCounts.useQuery(
    { projectId, filter },
    { enabled: !paused && !filterError, retry: false },
  );
  const dailyTraces = traceCounts.data
    ? traceCounts.data.finished7d / TOPIC_SETUP_BACKFILL_DAYS
    : null;

  async function submit() {
    await save.mutateAsync({
      projectId,
      id: rule.id,
      name: ruleName.trim() || suggestTopicRuleName(filter),
      filter,
      facetIds,
      sampling,
    });
    if (paused !== (rule.enabled === false))
      await setEnabled.mutateAsync({
        projectId,
        id: rule.id,
        enabled: !paused,
      });
    closeDialog();
  }

  return (
    <TopicRuleDialogView
      projectId={projectId}
      facets={facets}
      name={ruleName}
      onNameChange={setName}
      filter={filter}
      onFilterChange={setFilter}
      traceFilter={traceFilter}
      filterError={filterError}
      facetIds={facetIds}
      onFacetIdsChange={setFacetIds}
      paused={paused}
      onPausedChange={setPaused}
      samplingPercent={samplingPercent}
      onSamplingPercentChange={setSamplingPercent}
      dailyTraces={dailyTraces}
      canSave={traceFilter.ready && samplingValid && facetIds.length > 0}
      saving={save.isPending || setEnabled.isPending}
      saveError={(save.error ?? setEnabled.error)?.message ?? null}
      onSave={() => {
        submit().catch(() => undefined);
      }}
    />
  );
}
