import { createElement } from "react";
import {
  addons,
  types,
  useStorybookApi,
  useStorybookState,
} from "storybook/manager-api";
import { IconButton } from "storybook/internal/components";

import {
  COMPONENT_RELATIONSHIP_QUERY,
  COMPONENT_RELATIONSHIP_STORY_TAG,
  componentIdForDesignSystemStory,
} from "./docs/componentRelationshipData";

const ADDON_ID = "langfuse/component-relationships";

function ComponentRelationshipsTool() {
  const api = useStorybookApi();
  const { index, storyId, refId } = useStorybookState();
  const entry = storyId ? index?.[storyId] : undefined;
  if (
    refId ||
    entry?.type !== "story" ||
    !entry.tags?.includes(COMPONENT_RELATIONSHIP_STORY_TAG)
  ) {
    return null;
  }
  const componentId = componentIdForDesignSystemStory(entry.importPath);
  if (!componentId) return null;

  return createElement(
    IconButton,
    {
      title: "View component relationships",
      "aria-label": "View component relationships",
      onClick: () => {
        const query = new URLSearchParams(window.location.search);
        query.set("path", "/docs/design-component-relationships--docs");
        query.set(COMPONENT_RELATIONSHIP_QUERY, componentId);
        query.delete("args");
        api.navigateUrl(`?${query}`, {});
      },
    },
    "Relationships",
  );
}

addons.register(ADDON_ID, () => {
  addons.add(`${ADDON_ID}/toolbar`, {
    title: "View component relationships",
    type: types.TOOL,
    match: ({ viewMode }) => viewMode === "story",
    render: ComponentRelationshipsTool,
  });
});
