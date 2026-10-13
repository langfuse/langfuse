import { TagIcon } from "lucide-react";
import React from "react";
import { fn } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { Tag } from "./Tag";

const meta = preview.meta({
  component: Tag,
  args: {
    text: "seed-embed-3-small",
  },
});

export const Default = meta.story({});

export const Removable = meta.story({
  args: {
    remove: { onRemove: fn() },
  },
});

export const Variants = meta.story({
  parameters: {
    controls: {
      disable: true,
    },
  },
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Tag text="default" />
      <Tag text="gpt-5" remove={{ onRemove: fn() }} />
      <Tag
        text="Regression"
        secondaryText="(current)"
        remove={{ onRemove: fn() }}
      />
      <Tag text="locked" remove={{ onRemove: fn(), disabled: true }} />
      <Tag text="release-notes" icon={TagIcon} />
      <Tag text="warning" status="warning" />
      <Tag text="error" status="error" />
    </div>
  ),
});
