import { fireEvent, render, screen } from "@testing-library/react";
import { V4UpgradeBanner } from "./V4UpgradeBanner";
import { VersionLabel } from "@/src/components/VersionLabel";
import { SidebarNotifications } from "@/src/components/nav/sidebar-notifications";
import { V4_UPGRADE_GUIDE_URL } from "./useV4UpgradeHint";

const mockState = vi.hoisted(() => ({
  isLangfuseCloud: false,
  version: "v3.225.11",
  checkUpdate: null as null | {
    updateType: string | null;
    latestRelease: string;
  },
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

vi.mock("@/src/features/entitlements/hooks", () => ({
  usePlan: () => undefined,
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    backgroundMigrations: {
      status: { useQuery: () => ({ data: undefined }) },
    },
    public: {
      checkUpdate: { useQuery: () => ({ data: mockState.checkUpdate }) },
    },
  },
}));

// The gate reads VERSION at module load, so re-import after changing it.
const loadBanner = async () => {
  vi.resetModules();
  const mod = await import("./V4UpgradeBanner");
  return mod.V4UpgradeBanner;
};

const loadVersionLabel = async () => {
  vi.resetModules();
  const mod = await import("@/src/components/VersionLabel");
  return mod.VersionLabel;
};

const openVersionMenu = () => {
  const trigger = screen.getByRole("button", { name: /v3\.|v4\./ });
  fireEvent.keyDown(trigger, { key: "Enter" });
};

describe("v4 upgrade hint", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockState.isLangfuseCloud = false;
    mockState.version = "v3.225.11";
    mockState.checkUpdate = null;
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

  describe("VersionLabel", () => {
    it("points at v4 when the release check returns nothing", () => {
      render(<VersionLabel />);
      openVersionMenu();

      const menu = screen.getByRole("menu");
      expect(menu).toHaveTextContent("Langfuse v4 is available");
      expect(menu).not.toHaveTextContent("v4.56.0");
      expect(menu).toHaveTextContent("v3 no longer receives feature updates.");
      expect(menu).not.toHaveTextContent(/this is the latest release/i);
      expect(
        screen.getByRole("menuitem", { name: "Upgrade to v4" }),
      ).toHaveAttribute("href", V4_UPGRADE_GUIDE_URL);
    });

    it("includes the latest release when the release check succeeds", () => {
      mockState.checkUpdate = {
        updateType: "major",
        latestRelease: "v4.56.0",
      };

      render(<VersionLabel />);
      openVersionMenu();

      expect(
        screen.getByText("Langfuse v4 is available: v4.56.0"),
      ).toBeInTheDocument();
    });

    it("stays a plain version menu on Langfuse Cloud", () => {
      mockState.isLangfuseCloud = true;

      render(<VersionLabel />);
      openVersionMenu();

      expect(screen.queryByText(/Langfuse v4 is available/)).toBeNull();
      expect(
        screen.queryByRole("menuitem", { name: "Upgrade to v4" }),
      ).toBeNull();
    });

    it("stays a plain version menu once the deployment runs v4", async () => {
      mockState.version = "v4.0.0";
      const Label = await loadVersionLabel();

      render(<Label />);
      openVersionMenu();

      expect(screen.queryByText(/Langfuse v4 is available/)).toBeNull();
      expect(
        screen.queryByRole("menuitem", { name: "Upgrade to v4" }),
      ).toBeNull();
      expect(
        screen.getByText("This is the latest release"),
      ).toBeInTheDocument();
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
