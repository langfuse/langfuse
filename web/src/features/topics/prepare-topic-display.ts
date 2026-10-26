import {
  type Facet,
  type FacetTopic,
  orderedFacetTopics,
} from "./facet-topics";
import {
  topicColor,
  treemapSwatchColor,
  treemapTileClasses,
  UNASSIGNED_SWATCH_COLOR,
  unassignedTileClasses,
} from "./topic-map-colors";
import { type TopicsResultsView } from "./TopicsResultsViewSelect";

export const UNASSIGNED_TOPIC_ID = "__unassigned";

type TileColors = { tile: string; active: string; hover: string };

export type TopicDisplay = Pick<
  FacetTopic,
  "id" | "name" | "description" | "count"
> & {
  color: string;
  tiles: {
    small: TileColors;
    big: TileColors;
  };
};

/** Topic identity, counts, and colors shared by the list and treemap renderers. */
export function prepareTopicDisplay(facet: Facet, view: TopicsResultsView) {
  const mapIndices = new Map(
    orderedFacetTopics(facet).map((topic, index) => [topic.id, index]),
  );
  const topics: TopicDisplay[] = facet.topics.map(
    ({ id, name, description, count }, index) => ({
      id,
      name,
      description,
      count,
      color:
        view === "treemap"
          ? treemapSwatchColor(index)
          : topicColor(mapIndices.get(id) ?? -1),
      tiles: {
        small: treemapTileClasses(index, false),
        big: treemapTileClasses(index, true),
      },
    }),
  );
  const unassignedCount = facet.rows.filter((row) => !row.topicId).length;
  if (unassignedCount > 0) {
    topics.push({
      id: UNASSIGNED_TOPIC_ID,
      name: "Unassigned",
      description:
        "Traces without a topic, including outliers and summaries awaiting classification.",
      count: unassignedCount,
      color: UNASSIGNED_SWATCH_COLOR,
      tiles: { small: unassignedTileClasses, big: unassignedTileClasses },
    });
  }
  return { topics, total: facet.rows.length };
}
