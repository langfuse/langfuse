import { expect, fn, userEvent } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { VerifyResetPasswordButtonView } from "./VerifyResetPasswordButtonView";

const meta = preview.meta({
  component: VerifyResetPasswordButtonView,
});

export const Empty = meta.story({
  args: {
    code: "",
    loading: false,
    onCodeChange: fn(),
    onVerify: fn(),
  },
});

export const WithCode = meta.story({
  args: {
    code: "123456",
    loading: false,
    onCodeChange: fn(),
    onVerify: fn(),
  },
});

export const Loading = meta.story({
  args: {
    code: "123456",
    loading: true,
    onCodeChange: fn(),
    onVerify: fn(),
  },
});

export const TestVerifiesCode = meta.story({
  name: "(Test) Verifies a six-digit code",
  args: {
    code: "123456",
    loading: false,
    onCodeChange: fn(),
    onVerify: fn(),
  },
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Verify code" }));
    await expect(args.onVerify).toHaveBeenCalledOnce();
  },
});

export const TestRequiresSixDigitCode = meta.story({
  name: "(Test) Requires a six-digit code",
  args: {
    code: "12345",
    loading: false,
    onCodeChange: fn(),
    onVerify: fn(),
  },
  play: async ({ args, canvas }) => {
    const verifyButton = canvas.getByRole("button", { name: "Verify code" });
    await expect(verifyButton).toBeDisabled();
    await userEvent.click(verifyButton);
    await expect(args.onVerify).not.toHaveBeenCalled();
  },
});
