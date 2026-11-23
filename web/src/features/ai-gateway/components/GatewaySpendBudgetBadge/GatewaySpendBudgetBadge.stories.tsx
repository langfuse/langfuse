import { Fragment } from "react";
import { expect, screen, userEvent } from "storybook/test";

import preview from "@/.storybook/preview";
import { GatewaySpendBudgetBadge } from "./GatewaySpendBudgetBadge";

const meta = preview.meta({
  component: GatewaySpendBudgetBadge,
  args: { subject: "key" as const },
});

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

const underLimitArgs = {
  spendLimit: states[0].spendLimit,
  spentUsd: states[0].spentUsd,
};

export const VariantMatrix = meta.story({
  args: underLimitArgs,
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="grid w-fit grid-cols-[auto_auto] items-center gap-x-6 gap-y-2 text-sm">
      {states.map(({ label, spendLimit, spentUsd }) => (
        <Fragment key={label}>
          <span className="text-muted-foreground text-xs">{label}</span>
          <span>
            <GatewaySpendBudgetBadge
              subject="key"
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
  args: underLimitArgs,
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
  args: {
    spendLimit: { interval: "DAILY" as const, limitUsd: 20 },
    spentUsd: 23.75,
  },
});

export const UserReachedExplainsItsKeys = meta.story({
  name: "(Test) Reached user budget explains that all the user's keys are rejected",
  args: { ...Reached.input.args, subject: "user" },
  play: async ({ canvas }) => {
    await userEvent.hover(canvas.getByText("$23.75 / $20 daily"));
    const tooltip = await screen.findByRole("tooltip");
    await expect(tooltip).toHaveTextContent(
      /Requests with this user's keys are rejected until the budget resets/,
    );
  },
});

export const TotalReached = meta.story({
  args: {
    spendLimit: { interval: "TOTAL" as const, limitUsd: 20 },
    spentUsd: 20,
  },
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
