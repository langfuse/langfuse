import preview from "@/.storybook/preview";
import { expect, fn, userEvent } from "storybook/test";
import { GATEWAY_FIRST_REQUEST_DOCS_URL } from "@/src/features/ai-gateway/constants/gatewayDocsUrls";
import { GatewayCreateFirstKeyPlaceholder } from "./GatewayCreateFirstKeyPlaceholder";

const meta = preview.meta({
  component: GatewayCreateFirstKeyPlaceholder,
  parameters: { layout: "padded" },
});

export const Default = meta.story({
  args: {
    organizationName: "Acme",
    providers: [
      { provider: "ANTHROPIC", isConnected: true },
      { provider: "OPENAI", isConnected: true },
      { provider: "BEDROCK", isConnected: false },
    ],
    onCreateKey: fn(),
    usageInstructionsHref: GATEWAY_FIRST_REQUEST_DOCS_URL,
    modelsHref: "/organization/org-1/ai-gateway/models",
  },
});

export const CreatesKey = meta.story({
  name: "(Test) Creates Key",
  args: Default.input.args,
  play: async ({ canvas, args }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Create my key" }),
    );
    await expect(args.onCreateKey).toHaveBeenCalledOnce();
  },
});
