import { render, screen } from "@testing-library/react";

import { MonitorPagePermissions } from "./MonitorPagePermissions";

const mocks = vi.hoisted(() => ({
  useSessionMock: vi.fn(),
  useLangfuseCloudRegionMock: vi.fn(),
  useHasProjectAccessMock: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  useSession: mocks.useSessionMock,
}));

vi.mock("@/src/features/organizations/hooks", () => ({
  useLangfuseCloudRegion: mocks.useLangfuseCloudRegionMock,
}));

vi.mock("@/src/features/rbac/utils/checkProjectAccess", () => ({
  useHasProjectAccess: mocks.useHasProjectAccessMock,
}));

vi.mock("@/src/hooks/useProjectIdFromURL", () => ({
  default: () => "project-1",
}));

vi.mock("@/src/components/error-page", () => ({
  ErrorPage: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock("@/src/ee/features/billing/components/SupportOrUpgradePage", () => ({
  SupportOrUpgradePage: () => <div>Support or upgrade</div>,
}));

const setDeployment = (p: {
  isLangfuseCloud: boolean;
  v4WriteMode?: "legacy" | "dual" | "events_only";
  sessionStatus?: "authenticated" | "loading";
  hasAccess?: boolean;
}) => {
  mocks.useLangfuseCloudRegionMock.mockReturnValue({
    isLangfuseCloud: p.isLangfuseCloud,
    region: p.isLangfuseCloud ? "EU" : undefined,
  });
  mocks.useSessionMock.mockReturnValue({
    data:
      (p.sessionStatus ?? "authenticated") === "loading"
        ? null
        : { environment: { v4WriteMode: p.v4WriteMode } },
    status: p.sessionStatus ?? "authenticated",
  });
  mocks.useHasProjectAccessMock.mockReturnValue(p.hasAccess ?? true);
};

const renderGate = () =>
  render(
    <MonitorPagePermissions scope="monitors:read">
      <div>monitor content</div>
    </MonitorPagePermissions>,
  );

describe("MonitorPagePermissions", () => {
  it("renders children on Langfuse Cloud regardless of write mode", () => {
    setDeployment({ isLangfuseCloud: true, v4WriteMode: "legacy" });
    renderGate();
    expect(screen.getByText("monitor content")).toBeInTheDocument();
  });

  it("renders not-found on self-hosted deployments in legacy write mode", () => {
    setDeployment({ isLangfuseCloud: false, v4WriteMode: "legacy" });
    renderGate();
    expect(screen.getByText("Not found")).toBeInTheDocument();
    expect(screen.queryByText("monitor content")).not.toBeInTheDocument();
  });

  it.each(["dual", "events_only"] as const)(
    "renders children on self-hosted deployments in %s write mode",
    (v4WriteMode) => {
      setDeployment({ isLangfuseCloud: false, v4WriteMode });
      renderGate();
      expect(screen.getByText("monitor content")).toBeInTheDocument();
    },
  );

  it("renders nothing on self-hosted deployments while the session loads", () => {
    setDeployment({ isLangfuseCloud: false, sessionStatus: "loading" });
    const { container } = renderGate();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the upgrade page when the user lacks the RBAC scope", () => {
    setDeployment({
      isLangfuseCloud: false,
      v4WriteMode: "dual",
      hasAccess: false,
    });
    renderGate();
    expect(screen.getByText("Support or upgrade")).toBeInTheDocument();
    expect(screen.queryByText("monitor content")).not.toBeInTheDocument();
  });
});
