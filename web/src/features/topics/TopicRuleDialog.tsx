import { useState } from "react";
import {
  TOPICS_MAX_RULES,
  topicRuleFilterError,
  type TopicFacet,
  type TopicRule,
} from "@langfuse/shared/topics";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Input } from "@/src/components/design-system/Input/Input";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import { Slider } from "@/src/components/ui/Slider";
import { api } from "@/src/utils/api";
import { suggestTopicRuleName } from "./topic-maps";
import { TopicTraceFilterSection } from "./TopicTraceFilterSection";
import { useTopicTraceFilter } from "./useTopicTraceFilter";
import { TopicSliceFields } from "./TopicSliceFields";
import { TopicsErrorMessage } from "./TopicsErrorMessage";

/** Creates or edits a live map: filter, sampling, questions, name and pause. */
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
      title={rule ? `Edit ${rule.name}` : "New live map"}
      size="lg"
      actions={[
        {
          label: rule ? "Save" : "Create",
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
      <Dialog.Body>
        <div className="ph-no-capture contents">
          <p className="text-muted-foreground">
            Topics keep this run up to date as matching traces arrive. Changes
            apply to new traces.
          </p>
          <TopicTraceFilterSection
            projectId={projectId}
            filters={filter}
            onFiltersChange={setFilter}
            model={traceFilter}
          />
          <TopicSliceFields.Section
            label="Sample rate"
            description="Share of matching new traces that are summarized and grouped."
          >
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
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
              <div className="flex w-24 items-center gap-2">
                <Input
                  aria-label="Sample rate percent"
                  type="number"
                  min={0.1}
                  max={100}
                  inputMode="decimal"
                  value={samplingPercent}
                  error={!samplingValid}
                  onChange={(event) => setSamplingPercent(event.target.value)}
                />
                <span className="text-muted-foreground text-sm">%</span>
              </div>
            </div>
          </TopicSliceFields.Section>
          <TopicSliceFields.Section label="Questions">
            <TopicSliceFields.Facets
              facets={facets}
              selectedIds={facetIds}
              onChange={setFacetIds}
            />
          </TopicSliceFields.Section>
          <TopicSliceFields.Section
            label="Name"
            description="Suggested from the filters until you edit it."
          >
            <Input
              aria-label="Map name"
              value={ruleName}
              maxLength={100}
              onChange={(event) => setName(event.target.value)}
            />
          </TopicSliceFields.Section>
          {rule ? (
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="topics-map-paused" className="text-sm font-bold">
                Pause this run
              </label>
              <Switch
                id="topics-map-paused"
                checked={paused}
                onCheckedChange={setPaused}
              />
            </div>
          ) : null}
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
