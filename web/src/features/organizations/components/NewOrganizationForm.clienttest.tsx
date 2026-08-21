import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NewOrganizationForm } from "./NewOrganizationForm";

const mocks = vi.hoisted(() => ({
  captureMock: vi.fn(),
  mutateAsyncMock: vi.fn(),
  onSuccessMock: vi.fn(),
  updateSessionMock: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ update: mocks.updateSessionMock }),
}));

vi.mock("@/src/features/organizations/hooks", () => ({
  useLangfuseCloudRegion: () => ({ isLangfuseCloud: true }),
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => mocks.captureMock,
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    organizations: {
      create: {
        useMutation: () => ({
          isPending: false,
          mutateAsync: mocks.mutateAsyncMock,
        }),
      },
    },
  },
  reportTrpcErrorWithoutToast: () => undefined,
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

describe("NewOrganizationForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mutateAsyncMock.mockResolvedValue({ id: "org-1" });
    mocks.updateSessionMock.mockResolvedValue(undefined);
  });

  it("enables AI features by default when creating an organization", async () => {
    render(<NewOrganizationForm onSuccess={mocks.onSuccessMock} />);

    expect(
      screen.getByRole("switch", { name: "Enable AI powered features" }),
    ).toBeChecked();

    fireEvent.change(screen.getByLabelText("Organization name"), {
      target: { value: "Acme" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(mocks.mutateAsyncMock).toHaveBeenCalledWith({
        name: "Acme",
        aiFeaturesEnabled: true,
      });
    });
  });

  it("submits an explicit AI features opt-out", async () => {
    render(<NewOrganizationForm onSuccess={mocks.onSuccessMock} />);

    fireEvent.click(
      screen.getByRole("switch", { name: "Enable AI powered features" }),
    );
    fireEvent.change(screen.getByLabelText("Organization name"), {
      target: { value: "Acme" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(mocks.mutateAsyncMock).toHaveBeenCalledWith({
        name: "Acme",
        aiFeaturesEnabled: false,
      });
    });
  });
});
