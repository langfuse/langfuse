import { type ComponentProps, useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import preview from "@/.storybook/preview";
import { GatewayAnalyticsFilter } from "./GatewayAnalyticsFilter";

type Props = ComponentProps<typeof GatewayAnalyticsFilter>;

const meta = preview.meta({
  component: GatewayAnalyticsFilter,
  args: {
    label: "User",
    searchPlaceholder: "Search users",
    values: [],
    options: [
      { value: "user-1", label: "Demo User" },
      { value: "user-2", label: "Jane Doe" },
    ],
    onValueChange: fn(),
  } satisfies Props,
  render: (args) => {
    const [values, setValues] = useState(args.values);
    return (
      <GatewayAnalyticsFilter
        {...args}
        values={values}
        onValueChange={(next) => {
          setValues(next);
          args.onValueChange(next);
        }}
      />
    );
  },
});

export const Default = meta.story({});

export const OneSelected = meta.story({
  args: { values: ["user-1"] },
});

export const SeveralSelected = meta.story({
  args: { values: ["user-1", "user-2"] },
});

export const NoGatewayKeys = meta.story({
  name: "(Test) Accepts a deleted key's ID when no key is left",
  args: {
    label: "Gateway key",
    searchPlaceholder: "Search gateway keys",
    options: [],
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: /Gateway key/ }),
    );
    const body = within(canvasElement.ownerDocument.body);
    await waitFor(() =>
      expect(body.getByPlaceholderText("Enter custom value")).toBeVisible(),
    );
    await expect(body.queryByText("Select All")).toBeNull();
  },
});

export const CustomValue = meta.story({
  name: "(Test) Accepts an ID that is not in the options",
  play: async ({ args, canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: /User/ }),
    );
    const body = within(canvasElement.ownerDocument.body);
    const input = await body.findByPlaceholderText("Enter custom value");
    await userEvent.type(input, "former-member-id");
    const checkbox = input.previousElementSibling;
    if (!checkbox) throw new Error("Custom value checkbox not found");
    await userEvent.click(checkbox);
    await waitFor(() =>
      expect(args.onValueChange).toHaveBeenLastCalledWith(["former-member-id"]),
    );
  },
});
