import preview from "../../../../../.storybook/preview";
import { TableViewPresetsButton } from "./TableViewPresetsButton";

const meta = preview.meta({ component: TableViewPresetsButton });

export const Default = meta.story({
  args: { selectedView: null, count: 3 },
});

export const Selected = meta.story({
  args: {
    selectedView: { name: "Production errors", defaultLabel: null },
    count: 3,
  },
});

export const ProjectDefault = meta.story({
  args: {
    selectedView: {
      name: "Production traces",
      defaultLabel: "Project default",
    },
    count: 3,
  },
});

export const WithLongName = meta.story({
  args: {
    selectedView: {
      name: "Production agent traces with errors and high latency",
      defaultLabel: "Your default",
    },
    count: 3,
  },
});
