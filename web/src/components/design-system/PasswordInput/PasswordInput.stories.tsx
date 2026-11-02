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

export const TestPasswordManagerOptIn = meta.story({
  name: "(Test) Password Manager Opt-In",
  render: () => (
    <>
      <PasswordInput aria-label="API key" />
      <PasswordInput aria-label="Account password" allowPasswordManager />
    </>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByLabelText("API key")).toHaveAttribute(
      "data-1p-ignore",
    );
    await expect(canvas.getByLabelText("Account password")).not.toHaveAttribute(
      "data-1p-ignore",
    );
  },
});

export const TestSkipsVisibilityToggleWhenTabbing = meta.story({
  name: "(Test) Skips Visibility Toggle When Tabbing",
  args: {
    "aria-label": "Password",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByLabelText("Password");
    const toggle = canvas.getByRole("button", { name: "Show password" });

    input.focus();
    await userEvent.tab();

    await expect(toggle).not.toHaveFocus();
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
