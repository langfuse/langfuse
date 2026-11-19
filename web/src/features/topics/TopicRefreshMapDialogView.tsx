import {
  TOPIC_RULE_REFRESH_COOLDOWN_MS,
  TOPICS_MAX_SELECTION_RANGE_MS,
} from "@langfuse/shared/topics";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { topicRuleFreshness, type TopicRuleMap } from "./topic-maps";

const WINDOW_DAYS = Math.round(TOPICS_MAX_SELECTION_RANGE_MS / 86_400_000);
const COOLDOWN_MINUTES = Math.round(TOPIC_RULE_REFRESH_COOLDOWN_MS / 60_000);

/** "in about 5 hours"; approximate, since the scheduler picks the slot up within minutes. */
function untilLabel(at: string, now: number) {
  const hours = Math.round((Date.parse(at) - now) / 3_600_000);
  if (hours < 1) return "in under an hour";
  return `in about ${hours} ${hours === 1 ? "hour" : "hours"}`;
}

/** The Refresh map confirmation without data fetching; stories render it directly. */
export function TopicRefreshMapDialogView({
  rule,
  now,
  refreshing,
  onRefresh,
}: {
  rule: Pick<TopicRuleMap, "name" | "enabled" | "lastRefitAt" | "nextRefitAt">;
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
          {rule.nextRefitAt ? ` ${untilLabel(rule.nextRefitAt, now)}` : ""}.
        </p>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>Topics may be renamed, merged or split.</li>
          <li>
            Naming runs on your clustering model from Topics settings, so it
            uses tokens on that LLM connection.
          </li>
          <li>You can refresh this map again in {COOLDOWN_MINUTES} minutes.</li>
        </ul>
        <p className="text-muted-foreground text-xs">
          {topicRuleFreshness(rule, now)}
        </p>
      </Dialog.Body>
    </Dialog>
  );
}
