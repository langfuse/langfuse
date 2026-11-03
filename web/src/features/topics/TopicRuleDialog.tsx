import { useState } from "react";
import {
  TOPICS_MAX_RULES,
  TOPICS_RULE_FILTER_ERROR,
  topicRuleFilterError,
  type TopicFacet,
  type TopicRule,
} from "@langfuse/shared/topics";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Input } from "@/src/components/design-system/Input/Input";
import { api } from "@/src/utils/api";
import { dayWindow, suggestTopicRuleName } from "./topic-maps";
import { TopicSliceFields } from "./TopicSliceFields";
import { TopicsErrorMessage } from "./TopicsErrorMessage";
import { useTopicFilterColumns } from "./useTopicFilterColumns";

/** Creates or edits a continuous Topics rule: filter, sampling and facets. */
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
  const [now] = useState(Date.now);
  const [filter, setFilter] = useState(rule?.filter ?? []);
  const [facetIds, setFacetIds] = useState(
    rule?.facetIds ?? facets.map(({ id }) => id),
  );
  const [samplingPercent, setSamplingPercent] = useState(
    String(Math.round((rule?.sampling ?? 1) * 1000) / 10),
  );
  const [name, setName] = useState<string | null>(rule?.name ?? null);
  const { builderColumns } = useTopicFilterColumns({
    projectId,
    filter,
    range: dayWindow(7, now),
    scope: "rule",
    enabled: true,
  });
  const utils = api.useUtils();
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
    closeDialog();
    onSaved(saved, !rule);
  }

  return (
    <Dialog
      title={rule ? `Edit ${rule.name}` : "New topic rule"}
      size="lg"
      actions={[
        {
          label: rule ? "Save rule" : "Create rule",
          disabled:
            atLimit ||
            filterError !== null ||
            !samplingValid ||
            facetIds.length === 0,
          loading: save.isPending,
          onClick: () => {
            submit().catch(() => undefined);
          },
        },
      ]}
    >
      <Dialog.Body>
        <p className="text-muted-foreground">
          A rule keeps a live topic map for the traces it matches and
          re-clusters it on the refit schedule.{" "}
          {rule ? null : `${ruleCount} of ${TOPICS_MAX_RULES} rules used.`}
        </p>
        <TopicSliceFields.Section
          label="Traces"
          description="A trace matches when one of its spans meets every filter."
        >
          <TopicSliceFields.Filter
            columns={builderColumns}
            filter={filter}
            onChange={setFilter}
          />
          <p className="text-muted-foreground text-xs">
            {TOPICS_RULE_FILTER_ERROR}
          </p>
        </TopicSliceFields.Section>
        <TopicSliceFields.Section
          label="Sampling"
          description="Share of matching new traces that are summarized and assigned."
        >
          <div className="flex w-40 items-center gap-2">
            <Input
              aria-label="Sampling percentage"
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
        </TopicSliceFields.Section>
        <TopicSliceFields.Section label="Facets">
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
            aria-label="Rule name"
            value={ruleName}
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
          />
        </TopicSliceFields.Section>
        {atLimit ? (
          <TopicsErrorMessage
            message={`A project can have at most ${TOPICS_MAX_RULES} topic rules. Disable or edit an existing rule instead.`}
          />
        ) : null}
        {filterError && filter.length ? (
          <TopicsErrorMessage message={filterError} />
        ) : null}
        {save.error ? (
          <TopicsErrorMessage message={save.error.message} />
        ) : null}
      </Dialog.Body>
    </Dialog>
  );
}
