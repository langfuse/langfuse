import React from "react";
import preview from "../../../../.storybook/preview";
import { LangfuseWordmark } from "./LangfuseWordmark";

type ComponentProps = React.ComponentProps<typeof LangfuseWordmark>;
type Size = NonNullable<ComponentProps["size"]>;

const meta = preview.meta({
  component: LangfuseWordmark,
});

const allSizes = Object.keys({
  sm: true,
  md: true,
  lg: true,
} satisfies Record<Size, true>) as Size[];

export const Default = meta.story({});

export const AllSizes = meta.story({
  render: () => (
    <div className="flex items-end gap-6 p-2">
      {allSizes.map((size) => (
        <div key={size} className="flex flex-col items-center gap-2">
          <LangfuseWordmark size={size} />
          <span className="text-muted-foreground text-xs">{size}</span>
        </div>
      ))}
    </div>
  ),
});
