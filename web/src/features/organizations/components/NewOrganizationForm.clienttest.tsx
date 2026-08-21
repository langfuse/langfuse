import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NewOrganizationForm } from "./NewOrganizationForm";

vi.mock("@/src/components/design-system/Switch/Switch", () => ({
  Switch: ({
    checked,
    onCheckedChange,
    "aria-label": ariaLabel,
  }: {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    "aria-label"?: string;
  }) => (
    <button
      type="button"
      role="switch"
      aria-label={ariaLabel}
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
    />
  ),
}));

describe("NewOrganizationForm", () => {
  it("enables AI features by default when creating an organization", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<NewOrganizationForm isLangfuseCloud onSubmit={onSubmit} />);

    expect(
      screen.getByRole("switch", { name: "Enable AI powered features" }),
    ).toBeChecked();

    fireEvent.change(screen.getByLabelText("Organization name"), {
      target: { value: "Acme" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        name: "Acme",
        aiFeaturesEnabled: true,
      });
    });
  });

  it("submits an explicit AI features opt-out", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<NewOrganizationForm isLangfuseCloud onSubmit={onSubmit} />);

    fireEvent.click(
      screen.getByRole("switch", { name: "Enable AI powered features" }),
    );
    fireEvent.change(screen.getByLabelText("Organization name"), {
      target: { value: "Acme" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        name: "Acme",
        aiFeaturesEnabled: false,
      });
    });
  });
});
