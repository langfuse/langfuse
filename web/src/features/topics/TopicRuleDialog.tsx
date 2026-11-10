import { useState } from "react";
import {
  topicRuleFilterError,
  type TopicFacet,
  type TopicRule,
} from "@langfuse/shared/topics";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Input } from "@/src/components/design-system/Input/Input";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import { Slider } from "@/src/components/design-system/Slider/Slider";
import { api } from "@/src/utils/api";
import { samplingLabel, suggestTopicRuleName } from "./topic-maps";
import { TOPIC_SETUP_BACKFILL_DAYS } from "./topic-setup-flow";
import { TopicTraceFilterSection } from "./TopicTraceFilterSection";
import { useTopicTraceFilter } from "./useTopicTraceFilter";
import { TopicSliceFields } from "./TopicSliceFields";
import { TopicsErrorMessage } from "./TopicsErrorMessage";

const SAMPLE_MARKS = [1, 25, 50, 75, 100].map((value) => ({
  value,
  label: `${value}%`,
}));

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
    <Dialog
      title="Edit run"
      size="md"
      actions={[
        {
          label: "Save changes",
          disabled:
            !traceFilter.ready || !samplingValid || facetIds.length === 0,
          loading: save.isPending || setEnabled.isPending,
          onClick: () => {
            submit().catch(() => undefined);
          },
        },
      ]}
    >
      <Dialog.Body separators="both">
        <div className="ph-no-capture flex flex-col gap-6">
          <TopicSliceFields.Section label="Name">
            <Input
              aria-label="Run name"
              value={ruleName}
              maxLength={100}
              onChange={(event) => setName(event.target.value)}
            />
          </TopicSliceFields.Section>
          <TopicTraceFilterSection
            projectId={projectId}
            filters={filter}
            onFiltersChange={setFilter}
            model={traceFilter}
            title="Filter"
            description={null}
            previewDescription={null}
            showTraceIds={false}
            previewMode="collapsible"
          />
          <TopicSliceFields.Facets
            facets={facets}
            selectedIds={facetIds}
            onChange={setFacetIds}
          />
          <section className="bg-muted flex flex-col gap-4 rounded-lg p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col gap-1">
                <span className="flex items-center gap-2">
                  <label
                    htmlFor="topics-run-auto-analyze"
                    className="text-sm leading-none font-bold"
                  >
                    Auto-analyze
                  </label>
                  {paused ? null : (
                    <Badge text="LIVE" size="sm" color="success" />
                  )}
                </span>
                <p className="text-muted-foreground text-sm">
                  Analyze new matching traces as they arrive.
                </p>
              </div>
              <Switch
                id="topics-run-auto-analyze"
                checked={!paused}
                onCheckedChange={(on) => setPaused(!on)}
              />
            </div>
            {paused ? null : (
              <div className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm">Sample</span>
                  <span className="text-sm">
                    <span className="font-mono">{samplingLabel(sampling)}</span>
                    {dailyTraces !== null ? (
                      <span className="text-muted-foreground">
                        {` · ~${Math.round(dailyTraces * sampling).toLocaleString("en-US")} new traces / day`}
                      </span>
                    ) : null}
                  </span>
                </div>
                <Slider
                  marks={SAMPLE_MARKS}
                  min={1}
                  max={100}
                  step={1}
                  value={Math.round(Number(samplingPercent)) || 1}
                  aria-label="Sample rate"
                  onValueChange={(value) => setSamplingPercent(String(value))}
                />
              </div>
            )}
          </section>
          {filterError && filter.length ? (
            <TopicsErrorMessage message={filterError} />
          ) : null}
          {save.error || setEnabled.error ? (
            <TopicsErrorMessage
              message={(save.error ?? setEnabled.error)!.message}
            />
          ) : null}
        </div>
      </Dialog.Body>
    </Dialog>
  );
}
