import { fireEvent, render, screen } from "@testing-library/react";
import type { Session } from "next-auth";
import { useSession } from "next-auth/react";
import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";

import { ControlledFeaturePreviewModal } from "./ControlledFeaturePreviewModal";

const mocks = vi.hoisted(() => ({ mutate: vi.fn(), isV4: true }));

vi.mock("next-auth/react", () => ({ useSession: vi.fn() }));
vi.mock("@/src/features/events/hooks/useReadPath", () => ({
  useReadPath: () => ({ isV4: mocks.isV4 }),
  V4_PREVIEW_LABEL: "Fast (Preview)",
}));
vi.mock("@/src/features/events/lib/v4PreviewLabel", () => ({
  useReadPath: () => ({ isV4: mocks.isV4 }),
  V4_PREVIEW_LABEL: "Fast (Preview)",
}));
vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));
vi.mock("@/src/utils/api", () => ({
  api: {
    userAccount: {
      setFeaturePreviewEnabled: {
        useMutation: () => ({ mutate: mocks.mutate, isPending: false }),
      },
    },
  },
}));

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}));

describe("ControlledFeaturePreviewModal", () => {
  beforeEach(() => {
    mocks.mutate.mockClear();
    mocks.isV4 = true;
  });

  it("locks Topics on for staff and hides it after opting out of internal view", () => {
    const session = {
      user: {
        email: "member@clickhouse.com",
        featureFlags: testFeatureFlags({
          internalFeatures: true,
          langfuseTopics: false,
        }),
      },
      environment: { enableExperimentalFeatures: false },
    } as Session;
    vi.mocked(useSession).mockReturnValue({
      data: session,
      status: "authenticated",
      update: vi.fn(),
    });
    const modal = <ControlledFeaturePreviewModal open onOpenChange={vi.fn()} />;
    const { rerender } = render(modal);
    fireEvent.click(screen.getByRole("button", { name: /Langfuse Topics/ }));

    const toggle = screen.getByRole("switch", {
      name: "Toggle Langfuse Topics",
    });
    expect(toggle).toBeChecked();
    expect(toggle).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Langfuse Topics Enabled" }),
    ).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(mocks.mutate).not.toHaveBeenCalled();

    session.user!.featureFlags.internalFeatures = false;
    rerender(<ControlledFeaturePreviewModal open onOpenChange={vi.fn()} />);
    expect(
      screen.queryByRole("button", { name: /Langfuse Topics/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("switch", { name: "Toggle Langfuse Topics" }),
    ).not.toBeInTheDocument();
  });

  it("keeps session previews unavailable on the legacy read path despite stored opt-ins", () => {
    mocks.isV4 = false;
    vi.mocked(useSession).mockReturnValue({
      data: {
        user: {
          featureFlags: testFeatureFlags({
            sessionViewV2: true,
            sessionViewV2Timeline: true,
          }),
        },
        environment: { enableExperimentalFeatures: false },
      } as Session,
      status: "authenticated",
      update: vi.fn(),
    });
    render(<ControlledFeaturePreviewModal open onOpenChange={vi.fn()} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Redesigned Session View Unavailable",
      }),
    );
    for (const name of [
      "Toggle Redesigned Session View",
      "Toggle Session Timeline",
    ]) {
      const toggle = screen.getByRole("switch", { name });
      expect(toggle).not.toBeChecked();
      expect(toggle).toBeDisabled();
    }
  });

  it("offers dashboard authoring as an explicit employee preference in experimental deployments", () => {
    mocks.isV4 = false;
    const session = {
      user: {
        email: "member@CLICKHOUSE.COM",
        featureFlags: testFeatureFlags({ internalFeatures: true }),
      },
      environment: { enableExperimentalFeatures: true },
    } as Session;
    vi.mocked(useSession).mockReturnValue({
      data: session,
      status: "authenticated",
      update: vi.fn(),
    });
    const { rerender } = render(
      <ControlledFeaturePreviewModal open onOpenChange={vi.fn()} />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Dashboard block authoring/ }),
    );
    const toggle = screen.getByRole("switch", {
      name: "Toggle Dashboard block authoring",
    });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(mocks.mutate).toHaveBeenCalledWith({
      flag: "dashboardBlockAuthoring",
      enabled: true,
    });

    session.user!.featureFlags.internalFeatures = false;
    rerender(<ControlledFeaturePreviewModal open onOpenChange={vi.fn()} />);
    expect(
      screen.queryByRole("button", { name: /Dashboard block authoring/ }),
    ).not.toBeInTheDocument();
    session.user!.featureFlags.dashboardBlockAuthoring = true;
    rerender(<ControlledFeaturePreviewModal open onOpenChange={vi.fn()} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Dashboard block authoring/ }),
    );
    const holderToggle = screen.getByRole("switch", {
      name: "Toggle Dashboard block authoring",
    });
    expect(holderToggle).toBeChecked();
    fireEvent.click(holderToggle);
    expect(mocks.mutate).toHaveBeenLastCalledWith({
      flag: "dashboardBlockAuthoring",
      enabled: false,
    });

    session.user!.featureFlags.dashboardBlockAuthoring = false;
    rerender(<ControlledFeaturePreviewModal open onOpenChange={vi.fn()} />);
    expect(
      screen.queryByRole("button", { name: /Dashboard block authoring/ }),
    ).not.toBeInTheDocument();

    session.user!.email = "member@example.com";
    session.user!.featureFlags.internalFeatures = true;
    session.user!.featureFlags.dashboardBlockAuthoring = true;
    rerender(<ControlledFeaturePreviewModal open onOpenChange={vi.fn()} />);
    expect(
      screen.queryByRole("button", { name: /Dashboard block authoring/ }),
    ).not.toBeInTheDocument();
  });
});
