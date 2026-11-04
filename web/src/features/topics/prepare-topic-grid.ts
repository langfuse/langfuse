import { type RouterOutputs } from "@/src/utils/api";
import { type Facet, orderedFacetTopics } from "./facet-topics";
import { topicColor } from "./topic-map-colors";
import { sampleGridPoints, type GridPoint } from "./topic-grid-layout";

export function prepareTopicGrid(
  facet: Facet,
  mapData: RouterOutputs["topics"]["map"] | undefined,
) {
  const counts = new Map(facet.topics.map((topic) => [topic.id, topic.count]));
  const topics = orderedFacetTopics(facet).map((topic, index) => ({
    ...topic,
    count: counts.get(topic.id) ?? 0,
    color: topicColor(index),
  }));
  const rowsById = new Map(facet.rows.map((row) => [row.traceId, row]));
  const indexById = new Map(topics.map((topic, index) => [topic.id, index]));
  const { points, perDot } =
    mapData?.status === "ready"
      ? sampleGridPoints(
          mapData.points.map(
            (point): GridPoint => ({
              id: point.traceId,
              x: point.x,
              y: point.y,
              topicIndex: point.topicId
                ? (indexById.get(point.topicId) ?? -1)
                : -1,
            }),
          ),
        )
      : { points: [], perDot: 1 };

  return { topics, points, perDot, rowsById };
}
