import {
  TOPIC_RULE_REFRESH_COOLDOWN_MS,
  TOPICS_MAX_SELECTION_RANGE_MS,
} from "@langfuse/shared/topics";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { formatTopicCost } from "./topic-run-labels";
import {
  topicNextRefitLabel,
  topicRuleFreshness,
  type TopicRuleMap,
} from "./topic-maps";

const WINDOW_DAYS = Math.round(TOPICS_MAX_SELECTION_RANGE_MS / 86_400_000);
const COOLDOWN_MINUTES = Math.round(TOPIC_RULE_REFRESH_COOLDOWN_MS / 60_000);

/** The Refresh map confirmation without data fetching; stories render it directly. */
export function TopicRefreshMapDialogView({
  rule,
  previousRefresh,
  now,
  refreshing,
  onRefresh,
}: {
  rule: Pick<TopicRuleMap, "name" | "enabled" | "lastRefitAt">;
  previousRefresh?: { cost: number | null; partial: boolean };
  now: number;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <Dialog
      noCapture
      title={`Refresh “${rule.name}”?`}
      actions={[{ label: "Refresh", loading: refreshing, onClick: onRefresh }]}
    >
      <Dialog.Body>
        <p>
          Reclusters this map&apos;s topics from the last {WINDOW_DAYS} days of
          matching traces now, instead of at the next scheduled nightly update
          {rule.enabled !== false && rule.lastRefitAt
            ? ` ${topicNextRefitLabel(rule.lastRefitAt, now)}`
            : ""}
          .
        </p>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>Topics may be renamed, merged or split.</li>
          <li>
            This refresh reuses saved summaries and embeddings. Only naming
            topics uses your clustering model.
          </li>
          <li>You can refresh this map again in {COOLDOWN_MINUTES} minutes.</li>
        </ul>
        {previousRefresh?.cost != null && (
          <dl className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t pt-3">
            <dt>Previous refresh naming cost</dt>
            <dd className="font-mono text-sm">
              {formatTopicCost(previousRefresh.cost, previousRefresh.partial)}
            </dd>
          </dl>
        )}
        <p className="text-muted-foreground text-xs">
          {topicRuleFreshness(rule, now)}
        </p>
      </Dialog.Body>
    </Dialog>
  );
}
