import { expect, userEvent, within } from "storybook/test";

import preview from "@/.storybook/preview";
import { buildAgentSetupInstructions } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GeneratedKeyContent/fns/agentSetupInstructions/buildAgentSetupInstructions";
import { SetupInstructionsTabs } from "./SetupInstructionsTabs";

const context = {
  gatewayOrigin: "https://cloud.langfuse.com",
};

const meta = preview.meta({ component: SetupInstructionsTabs });

export const Default = meta.story({
  args: {
    organizationId: "seed-org-id",
    instructions: buildAgentSetupInstructions({
      ...context,
      providers: ["ANTHROPIC", "OPENAI"],
    }),
  },
});

export const TestClaudeSwitch = meta.story({
  name: "(Test) Claude tab switches between Code and Desktop",
  args: Default.input.args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("tab", { name: "Claude" }));
    await userEvent.click(canvas.getByRole("tab", { name: "Desktop" }));

    await expect(
      canvas.getByRole("link", { name: "How to connect Claude Desktop" }),
    ).toBeVisible();
  },
});

export const TestWarnsWithoutAnthropic = meta.story({
  name: "(Test) Claude tab warns without an Anthropic connection",
  args: {
    organizationId: "seed-org-id",
    instructions: buildAgentSetupInstructions({
      ...context,
      providers: ["OPENAI"],
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("tab", { name: "Claude" }));

    await expect(
      canvas.getByText(/needs an Anthropic provider connection/),
    ).toBeVisible();
  },
});
