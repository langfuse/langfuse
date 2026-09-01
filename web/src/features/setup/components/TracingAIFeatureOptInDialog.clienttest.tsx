import { fireEvent, render, screen } from "@testing-library/react";
import { TracingAIFeatureOptInDialog } from "./TracingAIFeatureOptInDialog";

describe("TracingAIFeatureOptInDialog", () => {
  it("allows admins to enable AI features or dismiss", () => {
    const onClose = vi.fn();
    const onEnableAiFeatures = vi.fn();

    render(
      <TracingAIFeatureOptInDialog
        open
        isLoading={false}
        hasOrganizationUpdateAccess
        organizationId="org-1"
        onClose={onClose}
        onEnableAiFeatures={onEnableAiFeatures}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Enable AI features" }));
    expect(onEnableAiFeatures).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows admin handoff copy for non-admin users", () => {
    render(
      <TracingAIFeatureOptInDialog
        open
        isLoading={false}
        hasOrganizationUpdateAccess={false}
        organizationId="org-1"
        onClose={vi.fn()}
        onEnableAiFeatures={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/Only organization admins can enable AI features\./),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Organization Settings" }),
    ).toHaveAttribute("href", "/organization/org-1/settings");
    expect(
      screen.queryByRole("button", { name: "Enable AI features" }),
    ).not.toBeInTheDocument();
  });
});
