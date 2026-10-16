import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { PersonalEnablementWarning } from "./PersonalEnablementWarning";

const meta = preview.meta({
  component: PersonalEnablementWarning,
});

export default meta;

export const WithPersonalLink = meta.story({
  args: {
    canOpenPersonalPreviews: true,
    onOpenPersonalPreviews: fn(),
  },
});

export const PersonalPreviewsUnavailable = meta.story({
  args: {
    canOpenPersonalPreviews: false,
    onOpenPersonalPreviews: fn(),
  },
});

export const OpensPersonalPreviews = meta.story({
  name: "(Test) Opens personal previews",
  args: {
    canOpenPersonalPreviews: true,
    onOpenPersonalPreviews: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "personal Feature Preview settings" }),
    );
    await expect(args.onOpenPersonalPreviews).toHaveBeenCalledOnce();
  },
});

export const HidesPersonalLink = meta.story({
  name: "(Test) Hides personal link",
  args: {
    canOpenPersonalPreviews: false,
    onOpenPersonalPreviews: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByRole("button", {
        name: "personal Feature Preview settings",
      }),
    ).toBeNull();
    await expect(
      canvas.getByText(/personal Feature Preview settings/),
    ).toBeInTheDocument();
  },
});
