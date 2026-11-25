import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { Button } from "../Button/Button";
import { FormError } from "./FormError";

const meta = preview.meta({
  component: FormError,
});

export const Default = meta.story({
  name: "(Test) Inline error",
  args: {
    message: "Header name is required.",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText("Header name is required."),
    ).not.toHaveAttribute("role");
  },
});

export const Announced = meta.story({
  name: "(Test) Announced error",
  args: {
    announce: true,
    message: undefined,
  },
  render: function AnnouncedError(args) {
    const [error, setError] = useState<string>();
    return (
      <div className="flex flex-col gap-2">
        <Button
          text="Test connection"
          onClick={() => setError("Connection failed.")}
        />
        <Button text="Clear error" onClick={() => setError(undefined)} />
        <FormError {...args} message={error} />
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const alert = canvas.getByRole("alert");
    await expect(alert).toBeEmptyDOMElement();

    await userEvent.click(
      canvas.getByRole("button", { name: "Test connection" }),
    );
    await expect(alert).toHaveTextContent("Connection failed.");
    await expect(canvas.getByRole("alert")).toBe(alert);

    await userEvent.click(canvas.getByRole("button", { name: "Clear error" }));
    await expect(alert).toBeEmptyDOMElement();
    await expect(canvas.getByRole("alert")).toBe(alert);
  },
});
