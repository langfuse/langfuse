import { useState } from "react";
import {
  TOPICS_MAX_RULES,
  topicRuleFilterError,
  type TopicFacet,
  type TopicRule,
} from "@langfuse/shared/topics";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { Input } from "@/src/components/design-system/Input/Input";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import { Slider } from "@/src/components/ui/Slider";
import { api } from "@/src/utils/api";
import { samplingLabel, suggestTopicRuleName } from "./topic-maps";
import { TOPIC_SETUP_BACKFILL_DAYS } from "./topic-setup-flow";
import { TopicTraceFilterSection } from "./TopicTraceFilterSection";
import { useTopicTraceFilter } from "./useTopicTraceFilter";
import { TopicSliceFields } from "./TopicSliceFields";
import { TopicsErrorMessage } from "./TopicsErrorMessage";

/** A sample answer per built-in question, shown beside its description. */
const QUESTION_EXAMPLES: Record<string, string> = {
  Intent: "Get a refund",
  Sentiment: "Frustrated",
  Outcome: "Resolved",
  Issues: "Wrong order ID",
};

/** Creates or edits a live run: filter, questions, auto-analyze, sample rate and name. */
export function TopicRuleDialog({
  projectId,
  facets,
  rule,
  ruleCount,
  onSaved,
  closeDialog,
}: {
  projectId: string;
  facets: TopicFacet[];
  rule: TopicRule | null;
  ruleCount: number;
  onSaved: (rule: TopicRule, created: boolean) => void;
  closeDialog: () => void;
}) {
  const [filter, setFilter] = useState(rule?.filter ?? []);
  // The same rule filter, suggestions and matching-traces preview as setup.
  const traceFilter = useTopicTraceFilter({
    projectId,
    active: true,
    filters: filter,
    onFiltersChange: setFilter,
  });
  const [facetIds, setFacetIds] = useState(
    rule?.facetIds ?? facets.map(({ id }) => id),
  );
  const [samplingPercent, setSamplingPercent] = useState(
    String(Math.round((rule?.sampling ?? 1) * 1000) / 10),
  );
  const [name, setName] = useState<string | null>(rule?.name ?? null);
  const [paused, setPaused] = useState(rule?.enabled === false);
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
  const atLimit = !rule && ruleCount >= TOPICS_MAX_RULES;
  const traceCounts = api.topics.setupTraceCounts.useQuery(
    { projectId, filter },
    { retry: false },
  );
  const dailyTraces = traceCounts.data
    ? traceCounts.data.finished7d / TOPIC_SETUP_BACKFILL_DAYS
    : null;

  async function submit() {
    const saved = await save.mutateAsync({
      projectId,
      id: rule?.id,
      name: ruleName.trim() || suggestTopicRuleName(filter),
      filter,
      facetIds,
      sampling,
    });
    if (rule && paused !== (rule.enabled === false))
      await setEnabled.mutateAsync({
        projectId,
        id: rule.id,
        enabled: !paused,
      });
    closeDialog();
    onSaved(saved, !rule);
  }

  return (
    <Dialog
      title={rule ? "Edit run" : "New live map"}
      size="lg"
      actions={[
        {
          label: rule ? "Save changes" : "Create",
          disabled:
            atLimit ||
            !traceFilter.ready ||
            !samplingValid ||
            facetIds.length === 0,
          loading: save.isPending || setEnabled.isPending,
          onClick: () => {
            submit().catch(() => undefined);
          },
        },
      ]}
    >
      <Dialog.Body separators="both">
        <div className="ph-no-capture flex flex-col gap-6">
          <TopicTraceFilterSection
            projectId={projectId}
            filters={filter}
            onFiltersChange={setFilter}
            model={traceFilter}
            title="Filter"
            description={null}
            previewDescription={null}
          />
          <section className="flex flex-col gap-2">
            <h3 className="text-sm leading-none font-bold">What to look for</h3>
            <div className="divide-y rounded-md border">
              {facets.map((facet) => {
                const checked = facetIds.includes(facet.id);
                const example = QUESTION_EXAMPLES[facet.name];
                return (
                  <label
                    key={facet.id}
                    className="flex cursor-pointer items-center gap-3 px-3 py-2.5"
                  >
                    <Checkbox
                      checked={checked}
                      aria-label={facet.name}
                      onCheckedChange={(next) =>
                        setFacetIds((current) =>
                          next === true
                            ? [...current, facet.id]
                            : current.filter((id) => id !== facet.id),
                        )
                      }
                    />
                    <span className="w-24 shrink-0 text-sm font-bold">
                      {facet.name}
                    </span>
                    <span
                      className="text-muted-foreground min-w-0 flex-1 truncate text-sm"
                      title={facet.description}
                    >
                      {facet.description}
                    </span>
                    {example ? <Badge text={example} color="outline" /> : null}
                  </label>
                );
              })}
            </div>
          </section>
          {rule ? (
            <section className="flex items-center justify-between gap-3">
              <div className="flex flex-col gap-1">
                <span className="flex items-center gap-2">
                  <label
                    htmlFor="topics-run-auto-analyze"
                    className="text-sm leading-none font-bold"
                  >
                    Auto-analyze
                  </label>
                  {paused ? (
                    <Badge text="PAUSED" size="sm" color="filled" />
                  ) : (
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
            </section>
          ) : null}
          <section className="flex items-center gap-4">
            <span className="text-sm font-bold">Sample</span>
            <div className="w-48 shrink-0">
              <Slider
                min={1}
                max={100}
                step={1}
                value={[Math.round(Number(samplingPercent)) || 1]}
                aria-label="Sample rate"
                onValueChange={(value) =>
                  setSamplingPercent(String(value[0] ?? samplingPercent))
                }
              />
            </div>
            <span className="w-12 font-mono text-sm">
              {samplingLabel(sampling)}
            </span>
            {dailyTraces !== null ? (
              <span className="text-muted-foreground ml-auto text-sm">
                {`~${Math.round(dailyTraces * sampling).toLocaleString("en-US")} new traces / day`}
              </span>
            ) : null}
          </section>
          <TopicSliceFields.Section label="Name">
            <Input
              aria-label="Run name"
              value={ruleName}
              maxLength={100}
              onChange={(event) => setName(event.target.value)}
            />
          </TopicSliceFields.Section>
          {atLimit ? (
            <TopicsErrorMessage
              message={`A project can have at most ${TOPICS_MAX_RULES} live maps. Pause or edit an existing one instead.`}
            />
          ) : null}
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
