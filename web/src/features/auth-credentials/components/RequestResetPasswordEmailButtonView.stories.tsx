import { expect, fn, userEvent } from "storybook/test";

import preview from "../../../.storybook/preview";
import { RequestResetPasswordEmailButtonView } from "./RequestResetPasswordEmailButtonView";

const meta = preview.meta({
  component: RequestResetPasswordEmailButtonView,
});

export const Default = meta.story({
  args: {
    buttonLabel: "Request password reset",
    disabled: false,
    loading: false,
    onClick: fn(),
  },
});

export const Authenticated = meta.story({
  args: {
    buttonLabel: "Verify email to change password",
    disabled: false,
    loading: false,
    onClick: fn(),
  },
});

export const Disabled = meta.story({
  args: {
    buttonLabel: "Request password reset",
    disabled: true,
    loading: false,
    onClick: fn(),
  },
});

export const Loading = meta.story({
  args: {
    buttonLabel: "Request password reset",
    disabled: false,
    loading: true,
    onClick: fn(),
  },
});

export const TestRequestsPasswordReset = meta.story({
  name: "(Test) Requests password reset",
  args: {
    buttonLabel: "Request password reset",
    disabled: false,
    loading: false,
    onClick: fn(),
  },
  play: async ({ args, canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Request password reset" }),
    );
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
});
