import { fn } from "storybook/test";

import preview from "@/.storybook/preview";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Pencil, RefreshCw, Trash2 } from "@langfuse/icons";
import {
  GatewayProviderCard,
  type GatewayProviderCardProps,
} from "./GatewayProviderCard";

const meta = preview.meta({
  component: GatewayProviderCard,
  args: {
    name: "OpenAI",
    provider: "OPENAI",
    modelCount: { enabled: 10, total: 11 },
    modelsHref: "/organization/org-story/ai-gateway/models?tab=models",
  } satisfies GatewayProviderCardProps,
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
});

export const Manager = meta.story({
  args: {
    status: "ENABLED" as const,
    credential: "sk-pro...15oA",
    actions: (
      <>
        <IconButton
          icon={RefreshCw}
          label="Refresh models for OpenAI"
          size="sm"
          onClick={fn()}
        />
        <IconButton
          icon={Pencil}
          label="Edit OpenAI"
          size="sm"
          onClick={fn()}
        />
        <IconButton
          icon={Trash2}
          label="Delete OpenAI"
          size="sm"
          onClick={fn()}
        />
      </>
    ),
  },
});

export const ReadOnly = meta.story({});

export const CredentialRejected = meta.story({
  args: {
    name: "Anthropic",
    provider: "ANTHROPIC" as const,
    status: "ERROR" as const,
    credential: "sk-ant...7QAA",
    modelCount: undefined,
  },
});

export const LoadingModels = meta.story({
  args: { modelCount: "loading" as const },
});
