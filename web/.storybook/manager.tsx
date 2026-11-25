import { createElement } from "react";
import { addons, types, useStorybookState } from "storybook/manager-api";
import { IconButton } from "storybook/internal/components";

import {
  COMPONENT_RELATIONSHIP_QUERY,
  COMPONENT_RELATIONSHIP_STORY_TAG,
  componentIdForDesignSystemStory,
} from "./docs/componentRelationshipData";

const ADDON_ID = "langfuse/component-relationships";

function ComponentRelationshipsTool() {
  const { index, storyId, refId } = useStorybookState();
  const entry = storyId ? index?.[storyId] : undefined;
  if (refId || !entry?.tags?.includes(COMPONENT_RELATIONSHIP_STORY_TAG)) {
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
        const url = new URL(window.location.href);
        url.searchParams.set(
          "path",
          "/docs/design-component-relationships--docs",
        );
        url.searchParams.set(COMPONENT_RELATIONSHIP_QUERY, componentId);
        url.searchParams.delete("args");
        url.hash = "";
        window.location.assign(url.href);
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
