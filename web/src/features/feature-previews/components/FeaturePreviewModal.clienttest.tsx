import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { fireEvent, render, screen } from "@testing-library/react";

import { FeaturePreviewModal } from "./FeaturePreviewModal";
import { ControlledFeaturePreviewModal } from "./ControlledFeaturePreviewModal";

const mocks = vi.hoisted(() => ({
  admin: false,
  langfuseTopics: false,
  mutate: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      user: {
        admin: mocks.admin,
        featureFlags: testFeatureFlags({
          langfuseTopics: mocks.langfuseTopics,
        }),
      },
      environment: { enableExperimentalFeatures: true },
    },
  }),
}));
vi.mock("@/src/features/events", () => ({
  useReadPath: () => ({ isV4: true }),
  V4_PREVIEW_LABEL: "V4 Preview",
}));
vi.mock("@/src/features/posthog-analytics", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));
vi.mock("@/src/features/notifications", () => ({
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
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
  it("only shows the Topics toggle to platform administrators, with explicit opt-in", () => {
    const { rerender } = render(
      <ControlledFeaturePreviewModal open onOpenChange={vi.fn()} />,
    );
    expect(
      screen.queryByRole("button", { name: /Langfuse Topics/ }),
    ).not.toBeInTheDocument();
    mocks.admin = true;
    rerender(<ControlledFeaturePreviewModal open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Langfuse Topics/ }));
    const toggle = screen.getByRole("switch", {
      name: "Toggle Langfuse Topics",
    });
    expect(toggle).not.toBeChecked();
    expect(toggle).toBeEnabled();
    fireEvent.click(toggle);
    expect(mocks.mutate).toHaveBeenCalledWith({
      flag: "langfuseTopics",
      enabled: true,
    });
    mocks.admin = false;
  });

  it("renders the session timeline toggle inside Compact Session View", () => {
    const onTimelineToggle = vi.fn();

    render(
      <FeaturePreviewModal
        open
        onOpenChange={vi.fn()}
        state={{
          modernSession: { enabled: true, onToggle: vi.fn() },
          sessionTimeline: {
            enabled: false,
            onToggle: onTimelineToggle,
          },
        }}
      />,
    );

    const timelineToggle = screen.getByRole("switch", {
      name: "Toggle Session Timeline",
    });
    fireEvent.click(timelineToggle);

    expect(onTimelineToggle).toHaveBeenCalledWith(true);
    expect(
      screen.queryByRole("button", { name: /Session Timeline/ }),
    ).not.toBeInTheDocument();
  });
});
