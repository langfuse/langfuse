import preview from "@/.storybook/preview";
import { ConnectionFilter } from "@/src/features/ai-gateway/components/GatewayModelsPage/components/GatewayModelsTab/components/ConnectionFilter/ConnectionFilter";
import {
  GatewayConnectionModelsReadOnlyTable,
  type GatewayConnectionModelsReadOnlyTableProps,
} from "./GatewayConnectionModelsReadOnlyTable";

const meta = preview.meta({
  component: GatewayConnectionModelsReadOnlyTable,
  args: {
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

export const WithProviderFilter = meta.story({
  args: {
    filters: (
      <ConnectionFilter
        connections={[
          { id: "openai", name: "openai", provider: "OPENAI" },
          { id: "anthropic", name: "anthropic", provider: "ANTHROPIC" },
        ]}
        value="openai"
        onChange={() => {}}
      />
    ),
  },
});

export const NoModels = meta.story({
  args: { models: [] as string[], enabledModels: new Set<string>() },
});
