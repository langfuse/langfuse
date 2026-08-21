import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConnectedNewOrganizationForm } from "./ConnectedNewOrganizationForm";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  createOrganization: vi.fn(),
  reportTrpcErrorWithoutToast: vi.fn(),
  updateSession: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ update: mocks.updateSession }),
}));

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

vi.mock("@/src/features/organizations/hooks", () => ({
  useLangfuseCloudRegion: () => ({ isLangfuseCloud: true }),
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => mocks.capture,
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    organizations: {
      create: {
        useMutation: () => ({ mutateAsync: mocks.createOrganization }),
      },
    },
  },
  reportTrpcErrorWithoutToast: mocks.reportTrpcErrorWithoutToast,
}));

describe("ConnectedNewOrganizationForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createOrganization.mockResolvedValue({ id: "organization-1" });
  });

  it("continues after the organization was created when refreshing the session fails", async () => {
    const sessionError = new Error("Failed to refresh session");
    const onSuccess = vi.fn();
    mocks.updateSession.mockRejectedValue(sessionError);

    render(<ConnectedNewOrganizationForm onSuccess={onSuccess} />);

    fireEvent.change(screen.getByLabelText("Organization name"), {
      target: { value: "Acme" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith("organization-1");
    });
    expect(mocks.reportTrpcErrorWithoutToast).toHaveBeenCalledWith(
      sessionError,
      "organizations",
    );
    expect(screen.getByLabelText("Organization name")).toHaveValue("");
    expect(screen.queryByText(sessionError.message)).not.toBeInTheDocument();
  });
});
