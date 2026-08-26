import { expect, userEvent, within } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { PasswordInput } from "./PasswordInput";

const meta = preview.meta({
  component: PasswordInput,
});

export const Default = meta.story({
  args: {
    "aria-label": "Password",
    placeholder: "Enter your password",
  },
});

export const Disabled = meta.story({
  args: {
    "aria-label": "Password",
    disabled: true,
    placeholder: "Enter your password",
  },
});

export const TestTogglesVisibility = meta.story({
  name: "(Test) Toggles Visibility",
  args: {
    "aria-label": "Password",
    defaultValue: "secret",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByLabelText("Password");
    const toggle = canvas.getByRole("button", { name: "Show password" });

    await expect(input).toHaveAttribute("type", "password");
    await userEvent.click(toggle);
    await expect(input).toHaveAttribute("type", "text");
    await expect(toggle).toHaveAccessibleName("Hide password");
    await expect(toggle).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(toggle);
    await expect(input).toHaveAttribute("type", "password");
  },
});

export const TestDisablesVisibilityToggle = meta.story({
  name: "(Test) Disables Visibility Toggle",
  args: {
    "aria-label": "Password",
    disabled: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByLabelText("Password");
    const toggle = canvas.getByRole("button", { name: "Show password" });

    await userEvent.click(toggle);
    await expect(input).toHaveAttribute("type", "password");
  },
});
