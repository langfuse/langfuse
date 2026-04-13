import { render, screen } from "@testing-library/react";
import { V4PromoBanner } from "./V4PromoBanner";

const mockUseV4 = jest.fn();

jest.mock("next/router", () => ({
  useRouter: () => ({
    pathname: "/project/[projectId]/traces",
  }),
}));

jest.mock("next-auth/react", () => ({
  useSession: () => ({
    status: "authenticated",
    data: {
      environment: {
        enableExperimentalFeatures: false,
      },
    },
  }),
}));

jest.mock("../../../components/useLocalStorage", () => ({
  __esModule: true,
  default: () => [false, jest.fn()],
}));

jest.mock("../../top-banner", () => ({
  useTopBanner: () => ({
    getTopBannerOffset: () => 0,
  }),
  useTopBannerRegistration: jest.fn(),
}));

jest.mock("../hooks/useV4Beta", () => ({
  useV4Beta: () => mockUseV4(),
}));

jest.mock("./V4IntroDialog", () => ({
  V4IntroDialog: ({ open }: { open: boolean }) =>
    open ? <div>Intro dialog</div> : null,
}));

jest.mock("../../posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => jest.fn(),
}));

jest.mock("../../organizations/hooks", () => ({
  useLangfuseCloudRegion: () => ({
    isLangfuseCloud: true,
  }),
}));

describe("V4PromoBanner", () => {
  beforeEach(() => {
    mockUseV4.mockReset();
  });

  it("does not show the promo banner for rollout-managed users who cannot toggle v4", () => {
    mockUseV4.mockReturnValue({
      isBetaEnabled: false,
      canToggleV4: false,
      enableWithIntro: jest.fn(),
      showIntroDialog: false,
      confirmIntroDialog: jest.fn(),
      isLoading: false,
    });

    render(<V4PromoBanner />);

    expect(screen.queryByText("Enable the", { exact: false })).toBeNull();
  });

  it("shows the promo banner for users who can still opt in", () => {
    mockUseV4.mockReturnValue({
      isBetaEnabled: false,
      canToggleV4: true,
      enableWithIntro: jest.fn(),
      showIntroDialog: false,
      confirmIntroDialog: jest.fn(),
      isLoading: false,
    });

    render(<V4PromoBanner />);

    expect(screen.getByText("Enable the", { exact: false })).not.toBeNull();
  });
});
