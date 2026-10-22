/* eslint-disable @repo/prefer-stories-over-client-tests */
import { fireEvent, render, screen } from "@testing-library/react";
import type { Session } from "next-auth";
import { useSession } from "next-auth/react";
import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";

import { ControlledFeaturePreviewModal } from "./ControlledFeaturePreviewModal";
import { FeaturePreviewModal } from "./FeaturePreviewModal";

const mocks = vi.hoisted(() => ({ mutate: vi.fn(), isV4: true }));

vi.mock("next-auth/react", () => ({ useSession: vi.fn() }));
vi.mock("@/src/features/events", () => ({
  useReadPath: () => ({ isV4: mocks.isV4 }),
  V4_PREVIEW_LABEL: "Fast (Preview)",
}));
vi.mock("@/src/features/posthog-analytics", () => ({
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

describe("FeaturePreviewModal", () => {
  beforeEach(() => {
    mocks.isV4 = true;
  });

  it("locks Topics on in internal view and restores the personal toggle after opting out", () => {
    const session = {
      user: {
        admin: true,
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
    expect(toggle).not.toBeChecked();
    expect(toggle).not.toBeDisabled();
    fireEvent.click(toggle);
    expect(mocks.mutate).toHaveBeenCalledWith({
      flag: "langfuseTopics",
      enabled: true,
    });
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

  it("lets users opt into Skill Management without other previews", () => {
    const onToggle = vi.fn();

    render(
      <FeaturePreviewModal
        open
        onOpenChange={vi.fn()}
        state={{ skillManagement: { enabled: false, onToggle } }}
      />,
    );

    fireEvent.click(
      screen.getByRole("switch", { name: "Toggle Skill Management" }),
    );

    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("renders the session timeline toggle inside Redesigned Session View", () => {
    const onTimelineToggle = vi.fn();

    render(
      <FeaturePreviewModal
        open
        onOpenChange={vi.fn()}
        state={{
          sessionViewV2: { enabled: true, onToggle: vi.fn() },
          sessionViewV2Timeline: {
            enabled: false,
            onToggle: onTimelineToggle,
          },
        }}
      />,
    );

    const timelineToggle = screen.getByRole("switch", {
      name: "Toggle Session Timeline",
    });
    expect(screen.getByRole("link", { name: "Give feedback" })).toHaveAttribute(
      "href",
      "https://github.com/orgs/langfuse/discussions/18687",
    );
    fireEvent.click(timelineToggle);

    expect(onTimelineToggle).toHaveBeenCalledWith(true);
    expect(
      screen.queryByRole("button", { name: /Session Timeline/ }),
    ).not.toBeInTheDocument();
  });
});
