import { useState } from "react";
import { type DataTablePeekViewProps } from "@/src/components/table/peek";
import { cn } from "@/src/utils/tailwind";
import { TopicsEmptyState } from "./TopicsEmptyState";
import {
  type Facet,
  allTopicsLabel,
  facetTopicTones,
  orderedFacetTopics,
} from "./facet-topics";
import {
  answerLabel,
  facetAnswerLabels,
  topicColor,
  topicToneColor,
} from "./topic-map-colors";
import { TopicTraceList } from "./TopicTraceList";

type BarGroup = {
  id: string;
  name: string;
  count: number;
  color: string;
  topicIds: string[];
};

/** Stacked share bar on top, ranked topics below, traces of the selection on the right. */
export function TopicBarsView({
  projectId,
  facet,
  peekView,
  tracePanelRef,
  onGenerateTopics,
  canGenerateTopics,
}: TopicBarsViewProps) {
  const groups = barGroups(facet);
  const labeled = facetAnswerLabels(facet.name).length > 0;
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(
    labeled ? (largest(groups)?.id ?? null) : null,
  );
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  if (facet.topics.length === 0) {
    return (
      <TopicsEmptyState
        onGenerateTopics={onGenerateTopics}
        canGenerateTopics={canGenerateTopics}
      />
    );
  }
  const total = groups.reduce((sum, group) => sum + group.count, 0);
  const selectedGroup = labeled
    ? (groups.find((group) => group.id === selectedGroupId) ?? largest(groups))
    : null;
  const colorOrder = orderedFacetTopics(facet).map((topic) => topic.id);
  const tones = facetTopicTones(facet);
  const listTopics = facet.topics.filter((topic) =>
    labeled && selectedGroup ? selectedGroup.topicIds.includes(topic.id) : true,
  );
  const maxCount = Math.max(1, ...listTopics.map((topic) => topic.count));
  const selectedTopic =
    facet.topics.find((topic) => topic.id === selectedTopicId) ??
    (labeled ? null : facet.topics[0]);

  function topicBarColor(topicId: string) {
    const tone = tones.get(topicId);
    return tone
      ? topicToneColor(tone)
      : pastel(topicColor(colorOrder.indexOf(topicId)));
  }
  function clearHover() {
    setHoveredId(null);
  }
  function selectGroup(groupId: string) {
    setSelectedTopicId(null);
    if (labeled) setSelectedGroupId(groupId);
    else setSelectedTopicId(groupId);
  }
  function selectTopic(topicId: string) {
    if (!labeled) {
      setSelectedTopicId(topicId);
      return;
    }
    setSelectedTopicId(topicId === selectedTopic?.id ? null : topicId);
  }

  const rows = facet.rows.filter((row) => {
    if (selectedTopic) return row.topicId === selectedTopic.id;
    if (selectedGroup) {
      return answerLabel(facet.name, row.summary)?.label === selectedGroup.id;
    }
    return true;
  });
  const title =
    selectedTopic?.name ?? selectedGroup?.name ?? allTopicsLabel(facet.name);
  const activeSegment = labeled
    ? (selectedGroup?.id ?? null)
    : (selectedTopic?.id ?? null);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row">
      <section
        aria-label="Topic bars"
        className="flex min-h-0 min-w-0 flex-col gap-4 overflow-y-auto p-4 lg:basis-3/5"
      >
        <div className="flex h-10 shrink-0 gap-1">
          {groups.map((group) => (
            <BarSegment
              key={group.id}
              group={group}
              isSelected={group.id === activeSegment}
              isHovered={group.id === hoveredId}
              hasSelection={activeSegment !== null}
              onSelect={selectGroup}
              onHover={setHoveredId}
              onLeave={clearHover}
            />
          ))}
        </div>
        <div className="flex flex-col gap-1">
          <h3 className="flex items-baseline gap-2 text-sm font-bold">
            {labeled && selectedGroup
              ? `Why ${selectedGroup.name.toLowerCase()}`
              : allTopicsLabel(facet.name)}
            {labeled && selectedGroup ? (
              <span className="text-muted-foreground font-mono text-xs font-normal">
                {selectedGroup.count.toLocaleString()} ·{" "}
                {formatShare(selectedGroup.count, total)}
              </span>
            ) : null}
          </h3>
          <ul className="flex flex-col">
            {listTopics.map((topic) => {
              const isSelected = topic.id === selectedTopic?.id;
              const isHovered = !labeled && topic.id === hoveredId;
              function select() {
                selectTopic(topic.id);
              }
              function hover() {
                if (!labeled) setHoveredId(topic.id);
              }
              return (
                <li key={topic.id}>
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    onClick={select}
                    onPointerEnter={hover}
                    onPointerLeave={clearHover}
                    className={cn(
                      "hover:bg-accent focus-visible:ring-ring flex w-full flex-col gap-1.5 rounded-sm px-2 py-2 text-left focus-visible:ring-2 focus-visible:outline-hidden",
                      (isSelected || isHovered) && "bg-accent",
                    )}
                  >
                    <span className="flex w-full items-baseline justify-between gap-3 text-sm">
                      <span
                        className={cn("truncate", isSelected && "font-bold")}
                        title={topic.name}
                      >
                        {topic.name}
                      </span>
                      <span className="text-muted-foreground shrink-0 font-mono text-xs">
                        {topic.count.toLocaleString()}
                      </span>
                    </span>
                    <span className="bg-muted block h-1.5 w-full overflow-hidden rounded-full">
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${(topic.count / maxCount) * 100}%`,
                          backgroundColor: topicBarColor(topic.id),
                        }}
                      />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
      <TopicTraceList
        key={selectedTopic?.id ?? selectedGroup?.id ?? "all"}
        projectId={projectId}
        title={title}
        swatchColor={
          selectedTopic ? topicBarColor(selectedTopic.id) : selectedGroup?.color
        }
        rows={rows}
        peekView={peekView}
        tracePanelRef={tracePanelRef}
        divider="side"
      />
    </div>
  );
}

function BarSegment({
  group,
  isSelected,
  isHovered,
  hasSelection,
  onSelect,
  onHover,
  onLeave,
}: {
  group: BarGroup;
  isSelected: boolean;
  isHovered: boolean;
  hasSelection: boolean;
  onSelect: (groupId: string) => void;
  onHover: (groupId: string) => void;
  onLeave: () => void;
}) {
  function select() {
    onSelect(group.id);
  }
  function hover() {
    onHover(group.id);
  }
  return (
    <button
      type="button"
      aria-pressed={isSelected}
      aria-label={`${group.name}, ${group.count} traces`}
      title={`${group.name} · ${group.count.toLocaleString()}`}
      onClick={select}
      onPointerEnter={hover}
      onPointerLeave={onLeave}
      className={cn(
        "focus-visible:ring-ring min-w-1 rounded-md focus-visible:ring-2 focus-visible:outline-hidden",
        isSelected && "ring-foreground ring-2 ring-offset-2",
        isHovered && !isSelected && "ring-border ring-2",
        hasSelection && !isSelected && !isHovered && "opacity-40",
      )}
      style={{ flexGrow: group.count, backgroundColor: group.color }}
    />
  );
}

/** Answer labels for Sentiment and Outcome, one group per topic otherwise. */
function barGroups(facet: Facet): BarGroup[] {
  const labels = facetAnswerLabels(facet.name);
  if (labels.length === 0) {
    const colorOrder = orderedFacetTopics(facet).map((topic) => topic.id);
    return facet.topics.map((topic) => ({
      id: topic.id,
      name: topic.name,
      count: topic.count,
      color: pastel(topicColor(colorOrder.indexOf(topic.id))),
      topicIds: [topic.id],
    }));
  }
  const counts = new Map<string, number>();
  for (const row of facet.rows) {
    const label = answerLabel(facet.name, row.summary)?.label;
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const tones = facetTopicTones(facet);
  return labels
    .filter(({ label }) => (counts.get(label) ?? 0) > 0)
    .map(({ label, tone }) => ({
      id: label,
      name: label,
      count: counts.get(label) ?? 0,
      color: topicToneColor(tone),
      topicIds: facet.topics
        .filter((topic) => topicLabel(facet, topic.id) === label)
        .map((topic) => topic.id),
    }))
    .filter((group) => group.topicIds.length > 0 || tones.size === 0);
}

/** Most common answer label among a topic's summaries. */
function topicLabel(facet: Facet, topicId: string) {
  const counts = new Map<string, number>();
  for (const row of facet.rows) {
    if (row.topicId !== topicId) continue;
    const label = answerLabel(facet.name, row.summary)?.label;
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  let best: string | null = null;
  for (const [label, count] of counts) {
    if (best === null || count > (counts.get(best) ?? 0)) best = label;
  }
  return best;
}

function largest(groups: BarGroup[]) {
  return groups.reduce<BarGroup | null>(
    (best, group) => (best === null || group.count > best.count ? group : best),
    null,
  );
}

/** "97%", "1.8%": one decimal below 10%. */
function formatShare(count: number, total: number) {
  if (total === 0) return "0%";
  const share = (count / total) * 100;
  return `${share < 10 ? share.toFixed(1) : Math.round(share)}%`;
}

type TopicBarsViewProps = {
  projectId: string;
  facet: Facet;
  peekView: DataTablePeekViewProps;
  tracePanelRef?: (element: HTMLElement | null) => void;
  onGenerateTopics: () => void;
  canGenerateTopics: boolean;
};

/** Soft fill for topic hues that carry no meaning, matching the 35% tiles elsewhere. */
function pastel(hex: string) {
  return `${hex}59`;
}
