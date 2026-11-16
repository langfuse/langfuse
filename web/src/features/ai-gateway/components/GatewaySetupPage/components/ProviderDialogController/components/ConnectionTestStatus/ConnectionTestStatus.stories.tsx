import { expect, userEvent, within } from "storybook/test";

import preview from "@/.storybook/preview";
import { Button } from "@/src/components/design-system/Button/Button";
import { ConnectionTestStatus } from "./ConnectionTestStatus";

/** Mirrors the dialog footer, where the status pushes the actions right. */
const meta = preview.meta({
  component: ConnectionTestStatus,
  decorators: [
    (Story) => (
      <div className="flex max-w-xl flex-col-reverse border-t p-6 pt-64 sm:flex-row sm:justify-end sm:space-x-2">
        <Story />
        <Button variant="secondary" text="Test again" />
        <Button text="Test and save" />
      </div>
    ),
  ],
});

export const Testing = meta.story({ args: { status: "pending" } });

export const Successful = meta.story({ args: { status: "success" } });

export const Failed = meta.story({
  args: {
    status: "error",
    failure: {
      title: "Provider response",
      status: 401,
      statusText: "Unauthorized",
      body: JSON.stringify({
        error: {
          code: "401",
          message:
            "Access denied due to invalid subscription key or wrong API endpoint. Make sure to provide a valid key for an active subscription and use a correct regional API endpoint for your resource.",
        },
      }),
    },
  },
});

export const FailedDetailsOpen = meta.story({
  name: "(Test) Opens the provider response",
  args: Failed.input.args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Show details" }));
    const page = within(canvasElement.ownerDocument.body);
    await expect(await page.findByText("401 Unauthorized")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Hide details" }),
    ).toBeVisible();
  },
});
