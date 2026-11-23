import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import preview from "../../../.storybook/preview";
import { DashboardBlockPlacement } from "./DashboardBlockPlacement";

const meta = preview.meta({ component: DashboardBlockPlacement });

export const ArbitraryPlacementIds = meta.story({
  name: "(Test) Arbitrary placement IDs remain distinct",
  args: {
    value: null,
    options: [
      { value: null, label: "After all chart rows" },
      { value: "", label: "Before the empty ID" },
      { value: '["after"]', label: "Before the sentinel-like ID" },
    ],
    disabled: false,
    onChange: fn(),
  },
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return (
      <DashboardBlockPlacement
        {...args}
        value={value}
        onChange={(next) => {
          setValue(next);
          args.onChange(next);
        }}
      />
    );
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      canvas.queryByRole("combobox", { name: "Position" }),
    ).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: /^Position:/ }));
    await userEvent.click(canvas.getByRole("combobox", { name: "Position" }));
    await userEvent.click(
      body.getByRole("option", { name: "Before the empty ID" }),
    );
    await expect(
      canvas.getByRole("button", { name: "Position: Before the empty ID" }),
    ).toBeVisible();
    await expect(args.onChange).toHaveBeenLastCalledWith("");
    await userEvent.click(canvas.getByRole("combobox", { name: "Position" }));
    await userEvent.click(
      body.getByRole("option", { name: "Before the sentinel-like ID" }),
    );
    await expect(
      canvas.getByRole("button", {
        name: "Position: Before the sentinel-like ID",
      }),
    ).toBeVisible();
    await expect(args.onChange).toHaveBeenLastCalledWith('["after"]');
    await userEvent.click(canvas.getByRole("combobox", { name: "Position" }));
    await userEvent.click(
      body.getByRole("option", { name: "After all chart rows" }),
    );
    await expect(
      canvas.getByRole("button", { name: "Position: After all chart rows" }),
    ).toBeVisible();
    await expect(args.onChange).toHaveBeenLastCalledWith(null);
  },
});
