import { expect, within } from "storybook/test";

import preview from "@/.storybook/preview";
import { ConnectionModelsSkeleton } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/ConnectionModelsSkeleton/ConnectionModelsSkeleton";
import { ConnectionFilter } from "@/src/features/ai-gateway/components/GatewayModelsPage/components/GatewayModelsTab/components/ConnectionFilter/ConnectionFilter";
import {
  GatewayConnectionModelsReadOnlyTable,
  type GatewayConnectionModelsReadOnlyTableProps,
} from "./GatewayConnectionModelsReadOnlyTable";

const meta = preview.meta({
  component: GatewayConnectionModelsReadOnlyTable,
  args: {
    connectionName: "openai",
    provider: "OPENAI",
    models: ["gpt-5", "gpt-5-mini", "gpt-4.1", "o3", "text-embedding-3-large"],
    enabledModels: new Set(["gpt-5", "gpt-5-mini", "o3"]),
  } satisfies GatewayConnectionModelsReadOnlyTableProps,
  decorators: [
    (Story) => (
      <div className="flex h-[480px] flex-col">
        <Story />
      </div>
    ),
  ],
});

export const Default = meta.story({});

const providerFilter = (
  <ConnectionFilter
    connections={[
      { id: "openai", name: "openai", provider: "OPENAI" },
      { id: "anthropic", name: "anthropic", provider: "ANTHROPIC" },
    ]}
    value="openai"
    onChange={() => {}}
  />
);

export const WithProviderFilter = meta.story({
  args: { filters: providerFilter },
});

export const LoadingKeepsToolbarInPlace = meta.story({
  name: "(Test) Loading skeleton keeps the connection select in place",
  args: { filters: providerFilter },
  render: (args) => (
    <div className="flex flex-col gap-8">
      <section aria-label="Loading" className="flex h-[200px] flex-col">
        <ConnectionModelsSkeleton filters={providerFilter} />
      </section>
      <section aria-label="Loaded" className="flex h-[200px] flex-col">
        <GatewayConnectionModelsReadOnlyTable {...args} />
      </section>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const loading = canvas.getByRole("region", { name: "Loading" });
    const loaded = canvas.getByRole("region", { name: "Loaded" });
    const offset = (section: HTMLElement) =>
      within(section)
        .getByRole("combobox", { name: "Connection" })
        .getBoundingClientRect().left - section.getBoundingClientRect().left;

    await expect(Math.abs(offset(loading) - offset(loaded))).toBeLessThan(1);
  },
});

export const NoModels = meta.story({
  args: { models: [] as string[], enabledModels: new Set<string>() },
});
