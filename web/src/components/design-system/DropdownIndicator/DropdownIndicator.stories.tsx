import preview from "../../../../.storybook/preview";
import { DropdownIndicator } from "./DropdownIndicator";

const meta = preview.meta({
  component: DropdownIndicator,
});

export const Default = meta.story({});

export const VariantMatrix = meta.story({
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <DropdownIndicator />
        <DropdownIndicator direction="up" />
        <DropdownIndicator direction="right" />
        <DropdownIndicator direction="left" />
        <DropdownIndicator direction="up-down" />
      </div>
      <div className="flex items-center gap-2">
        <DropdownIndicator size="sm" />
        <DropdownIndicator size="sm" direction="right" />
        <DropdownIndicator size="sm" direction="up-down" />
      </div>
      <div className="flex items-center gap-2 text-sm">
        Label
        <DropdownIndicator nudge />
      </div>
    </div>
  ),
});
