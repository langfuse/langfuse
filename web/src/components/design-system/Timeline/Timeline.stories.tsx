import { fn } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { Timeline } from "./Timeline";

const meta = preview.meta({
  component: Timeline,
});

const versions = [
  { version: 3, message: "Tighten system prompt", author: "jane" },
  { version: 2, message: "Add tool instructions", author: "sam" },
  { version: 1, message: "Initial version", author: "jane" },
];

function renderItems(items: typeof versions, activeVersion?: number) {
  return items.map((item) => (
    <Timeline.Item
      key={item.version}
      isActive={item.version === activeVersion}
      onClick={fn()}
    >
      <span className="text-xs"># {item.version}</span>
      <span
        className="text-muted-foreground truncate text-xs"
        title={item.message}
      >
        {item.message}
      </span>
      <span className="text-muted-foreground text-xs">by {item.author}</span>
    </Timeline.Item>
  ));
}

export const Default = meta.story({
  args: {
    children: renderItems(versions),
  },
});

export const WithSelection = meta.story({
  args: {
    children: renderItems(versions, 2),
  },
});

export const LongList = meta.story({
  args: {
    children: renderItems(
      Array.from({ length: 12 }, (_, i) => ({
        version: 12 - i,
        message: `Revision ${12 - i}`,
        author: i % 2 === 0 ? "jane" : "sam",
      })),
      12,
    ),
  },
});
