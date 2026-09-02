import {
  differenceInDays,
  differenceInHours,
  differenceInMinutes,
  differenceInWeeks,
  isSameDay,
  startOfWeek,
  subDays,
} from "date-fns";

export const CONVERSATION_HISTORY_GROUP_IDS = [
  "today",
  "yesterday",
  "this-week",
  "last-week",
  "older",
] as const;

export type ConversationHistoryGroupId =
  (typeof CONVERSATION_HISTORY_GROUP_IDS)[number];

export const CONVERSATION_HISTORY_GROUP_LABELS: Record<
  ConversationHistoryGroupId,
  string
> = {
  today: "Today",
  yesterday: "Yesterday",
  "this-week": "This week",
  "last-week": "Last week",
  older: "Older",
};

export type ConversationHistoryGroup<T> = {
  id: ConversationHistoryGroupId;
  label: string;
  items: T[];
};

export function getConversationHistoryGroup(
  updatedAt: Date,
  now: Date = new Date(),
): ConversationHistoryGroupId {
  if (isSameDay(updatedAt, now)) {
    return "today";
  }

  if (isSameDay(updatedAt, subDays(now, 1))) {
    return "yesterday";
  }

  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  if (updatedAt >= weekStart) {
    return "this-week";
  }

  const lastWeekStart = startOfWeek(subDays(now, 7), { weekStartsOn: 1 });
  if (updatedAt >= lastWeekStart) {
    return "last-week";
  }

  return "older";
}

export function groupConversationsByRecency<T extends { updatedAt: Date }>(
  conversations: readonly T[],
  now: Date = new Date(),
): ConversationHistoryGroup<T>[] {
  const buckets: Record<ConversationHistoryGroupId, T[]> = {
    today: [],
    yesterday: [],
    "this-week": [],
    "last-week": [],
    older: [],
  };

  for (const conversation of conversations) {
    buckets[getConversationHistoryGroup(conversation.updatedAt, now)].push(
      conversation,
    );
  }

  return CONVERSATION_HISTORY_GROUP_IDS.flatMap((id) => {
    const items = buckets[id];
    return items.length === 0
      ? []
      : [{ id, label: CONVERSATION_HISTORY_GROUP_LABELS[id], items }];
  });
}

export function formatConversationHistoryAge(
  updatedAt: Date,
  now: Date = new Date(),
): string {
  const minutes = differenceInMinutes(now, updatedAt);

  if (minutes < 1) {
    return "now";
  }

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = differenceInHours(now, updatedAt);
  if (hours < 24) {
    return `${hours}h`;
  }

  const days = differenceInDays(now, updatedAt);
  if (days < 14) {
    return `${days}d`;
  }

  return `${Math.max(1, differenceInWeeks(now, updatedAt))}w`;
}
