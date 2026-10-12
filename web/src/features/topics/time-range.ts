import { addDays, format } from "date-fns";
import type { TopicTimeRange } from "@langfuse/shared/topics";

const DAY = 86_400_000;
export const topicTimeRangePresets = [
  { value: "1", label: "Last 24 hours" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "custom", label: "Custom range" },
];

export function relativeTopicTimeRange(days: number, to = new Date()) {
  return { from: new Date(to.getTime() - days * DAY), to };
}

export function isValidTopicTimeRange(range: TopicTimeRange) {
  return (
    range.from < range.to &&
    range.to.getTime() - range.from.getTime() <= 93 * DAY
  );
}

export function topicCalendarDates(range: TopicTimeRange) {
  return {
    from: format(range.from, "yyyy-MM-dd"),
    to: format(new Date(range.to.getTime() - 1), "yyyy-MM-dd"),
  };
}

export function topicCalendarRange({ from, to }: { from: string; to: string }) {
  return {
    from: new Date(`${from}T00:00:00`),
    to: addDays(new Date(`${to}T00:00:00`), 1),
  };
}
