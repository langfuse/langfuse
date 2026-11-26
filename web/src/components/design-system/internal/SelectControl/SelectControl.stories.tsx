import preview from "../../../../../.storybook/preview";
import { SelectControl } from "./SelectControl";

const meta = preview.meta({
  component: SelectControl,
});

const trigger = (label: string) => (
  <button type="button" disabled={label === "Disabled"}>
    <span className="min-w-0 flex-1 truncate">{label}</span>
  </button>
);

export const VariantMatrix = meta.story({
  render: () => (
    <div className="flex w-72 flex-col gap-3">
      <SelectControl>{trigger("Empty")}</SelectControl>
      <SelectControl>{trigger("GPT-4.1")}</SelectControl>
      <SelectControl
        clear={{ label: "Clear selection", onClear: () => undefined }}
      >
        {trigger("GPT-4.1")}
      </SelectControl>
      <SelectControl disabled>{trigger("Disabled")}</SelectControl>
      <SelectControl
        disabled
        clear={{ label: "Clear selection", onClear: () => undefined }}
      >
        {trigger("Disabled")}
      </SelectControl>
    </div>
  ),
});
