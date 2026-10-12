import { render, screen } from "@testing-library/react";
import { V4UpgradeBanner } from "./V4UpgradeBanner";
import { SidebarNotifications } from "@/src/components/nav/sidebar-notifications";
import { V4_UPGRADE_GUIDE_URL } from "./useV4UpgradeHint";

const mockState = vi.hoisted(() => ({
  isLangfuseCloud: false,
  version: "v3.225.11",
}));

vi.mock("@/src/constants", () => ({
  get VERSION() {
    return mockState.version;
  },
}));

vi.mock("@/src/features/organizations/hooks", () => ({
  useLangfuseCloudRegion: () => ({
    isLangfuseCloud: mockState.isLangfuseCloud,
    region: mockState.isLangfuseCloud ? "EU" : undefined,
  }),
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

// The gate reads VERSION at module load, so re-import after changing it.
const loadBanner = async () => {
  vi.resetModules();
  const mod = await import("./V4UpgradeBanner");
  return mod.V4UpgradeBanner;
};

describe("v4 upgrade hint", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockState.isLangfuseCloud = false;
    mockState.version = "v3.225.11";
  });

  describe("V4UpgradeBanner", () => {
    it("links self-hosted v3 deployments to the upgrade guide", () => {
      render(<V4UpgradeBanner />);

      expect(screen.getByText("Langfuse v4 is available.")).toBeInTheDocument();
      expect(
        screen.getByText(/v3 no longer receives feature updates/i),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Upgrade guide" }),
      ).toHaveAttribute("href", V4_UPGRADE_GUIDE_URL);
    });

    it("stays hidden on Langfuse Cloud", () => {
      mockState.isLangfuseCloud = true;

      const { container } = render(<V4UpgradeBanner />);

      expect(container).toBeEmptyDOMElement();
    });

    it("stays hidden once the deployment runs v4", async () => {
      mockState.version = "v4.0.0";
      const Banner = await loadBanner();

      const { container } = render(<Banner />);

      expect(container).toBeEmptyDOMElement();
    });
  });

  describe("SidebarNotifications", () => {
    it("shows the upgrade card first on self-hosted v3", () => {
      render(<SidebarNotifications />);

      expect(screen.getByText("Langfuse v4 is available")).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: /Upgrade guide/ }),
      ).toHaveAttribute("href", V4_UPGRADE_GUIDE_URL);
    });

    it("does not show the upgrade card on Langfuse Cloud", () => {
      mockState.isLangfuseCloud = true;

      render(<SidebarNotifications />);

      expect(
        screen.queryByText("Langfuse v4 is available"),
      ).not.toBeInTheDocument();
    });
  });
});
