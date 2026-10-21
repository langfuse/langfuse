import { Tag } from "@/src/components/design-system/Tag/Tag";

/** Tracing table cell: one tag per facet with a current topic, on one line like Trace Tags. */
export function TraceTopicChips({
  topics,
}: {
  topics: { facet: string; topic: string }[];
}) {
  return (
    <div className="flex gap-x-2 overflow-hidden">
      {topics.map(({ facet, topic }) => (
        <Tag key={facet} text={`${facet.toLowerCase()}: ${topic}`} />
      ))}
    </div>
  );
}
