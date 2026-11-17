import { Fragment } from "react";
import { expect, screen, userEvent } from "storybook/test";

import preview from "@/.storybook/preview";
import { GatewayApiKeyBudgetBadge } from "./GatewayApiKeyBudgetBadge";

const meta = preview.meta({ component: GatewayApiKeyBudgetBadge });

const states = [
  {
    label: "Under limit",
    spendLimit: { interval: "MONTHLY", limitUsd: 100 },
    spentUsd: 42.5,
  },
  {
    label: "Near limit",
    spendLimit: { interval: "WEEKLY", limitUsd: 500 },
    spentUsd: 410,
  },
  {
    label: "Reached",
    spendLimit: { interval: "DAILY", limitUsd: 20 },
    spentUsd: 23.75,
  },
  {
    label: "Spend not recorded",
    spendLimit: { interval: "TOTAL", limitUsd: 1000 },
    spentUsd: undefined,
  },
] as const;

export const VariantMatrix = meta.story({
  args: states[0],
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="grid w-fit grid-cols-[auto_auto] items-center gap-x-6 gap-y-2 text-sm">
      {states.map(({ label, spendLimit, spentUsd }) => (
        <Fragment key={label}>
          <span className="text-muted-foreground text-xs">{label}</span>
          <span>
            <GatewayApiKeyBudgetBadge
              spendLimit={spendLimit}
              spentUsd={spentUsd}
            />
          </span>
        </Fragment>
      ))}
    </div>
  ),
});

export const UnderLimit = meta.story({
  args: states[0],
});

export const UnderLimitExplainsUsage = meta.story({
  name: "(Test) Budget under its limit explains usage and reset",
  args: UnderLimit.input.args,
  play: async ({ canvas }) => {
    await userEvent.hover(canvas.getByText("$42.5 / $100 monthly"));
    const tooltip = await screen.findByRole("tooltip");
    await expect(tooltip).toHaveTextContent("Within budget");
    await expect(tooltip).toHaveTextContent(
      /42% of the budget is used\. It resets on .*\d/,
    );
  },
});

export const Reached = meta.story({
  args: { spendLimit: { interval: "DAILY", limitUsd: 20 }, spentUsd: 23.75 },
});

export const TotalReached = meta.story({
  args: { spendLimit: { interval: "TOTAL", limitUsd: 20 }, spentUsd: 20 },
});

export const ReachedExplainsReset = meta.story({
  name: "(Test) Reached budget explains when it resets",
  args: Reached.input.args,
  play: async ({ canvas }) => {
    await userEvent.hover(canvas.getByText("$23.75 / $20 daily"));
    const tooltip = await screen.findByRole("tooltip");
    await expect(tooltip).toHaveTextContent("Budget reached");
    await expect(tooltip).toHaveTextContent(/until the budget resets on .*\d/);
  },
});
