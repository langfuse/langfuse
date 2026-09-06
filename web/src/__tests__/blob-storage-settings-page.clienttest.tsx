import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import englishIntegrationsSettings from "@/src/features/i18n/messages/en/integrationsSettings.json";
import simplifiedChineseIntegrationsSettings from "@/src/features/i18n/messages/zh-CN/integrationsSettings.json";

const mocks = vi.hoisted(() => ({
  hasAccess: true,
  hasEntitlement: false,
  useQuery: vi.fn(),
}));

vi.mock("next/router", () => ({
  useRouter: () => ({ query: { projectId: "proj-1" } }),
}));

vi.mock("next/link", () => ({
  default: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));

vi.mock("@/src/components/layouts/container-page", () => ({
  default: ({
    children,
    headerProps,
  }: {
    children: ReactNode;
    headerProps: { title: string };
  }) => (
    <div>
      <h1>{headerProps.title}</h1>
      {children}
    </div>
  ),
}));

vi.mock("@/src/components/layouts/header", () => ({
  default: ({ title }: { title: string }) => <h2>{title}</h2>,
}));

vi.mock("@/src/components/ui/StatusBadge/StatusBadge", () => ({
  StatusBadge: () => null,
}));

vi.mock("@/src/components/ui/button", () => ({
  Button: ({ children }: { children: ReactNode }) => (
    <button>{children}</button>
  ),
}));

vi.mock("@/src/components/ui/card", () => ({
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock(
  "@/src/features/analytics-integrations/components/IntegrationSettingsSkeleton",
  () => ({
    IntegrationSettingsSkeleton: () => <div>Loading configuration</div>,
  }),
);

vi.mock(
  "@/src/features/blobstorage-integration/components/BlobStorageIntegrationContainer",
  () => ({
    BlobStorageIntegrationContainer: () => <div>Blob storage form</div>,
  }),
);

vi.mock(
  "@/src/features/blobstorage-integration/components/BlobStorageStatusSection",
  () => ({
    BlobStorageStatusSection: () => <div>Blob storage status</div>,
  }),
);

vi.mock("@/src/features/rbac/utils/checkProjectAccess", () => ({
  useHasProjectAccess: () => mocks.hasAccess,
}));

vi.mock("@/src/features/entitlements/hooks", () => ({
  useHasEntitlement: () => mocks.hasEntitlement,
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    blobStorageIntegration: {
      get: {
        useQuery: mocks.useQuery,
      },
    },
  },
}));

import BlobStorageIntegrationSettings from "@/src/pages/project/[projectId]/settings/integrations/blobstorage";

const renderPage = (locale: "en" | "zh-CN" = "en") =>
  render(
    <NextIntlClientProvider
      locale={locale}
      messages={{
        integrationsSettings:
          locale === "en"
            ? englishIntegrationsSettings
            : simplifiedChineseIntegrationsSettings,
      }}
    >
      <BlobStorageIntegrationSettings />
    </NextIntlClientProvider>,
  );

describe("BlobStorageIntegrationSettings entitlement gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasAccess = true;
    mocks.hasEntitlement = false;
    mocks.useQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
    });
  });

  it("does not fetch config and shows a plan message without scheduled-blob-exports", () => {
    renderPage();

    expect(
      screen.getByText("This feature is not available in your current plan."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Loading configuration")).not.toBeInTheDocument();
    expect(screen.queryByText("Blob storage form")).not.toBeInTheDocument();
    expect(mocks.useQuery).toHaveBeenCalledWith(
      { projectId: "proj-1" },
      expect.objectContaining({ enabled: false }),
    );
  });

  it("shows the role message when entitled but without integrations access", () => {
    mocks.hasEntitlement = true;
    mocks.hasAccess = false;

    renderPage();

    expect(
      screen.getByText(
        /Your current role does not grant you access to these settings/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Loading configuration")).not.toBeInTheDocument();
    expect(mocks.useQuery).toHaveBeenCalledWith(
      { projectId: "proj-1" },
      expect.objectContaining({ enabled: false }),
    );
  });

  it("fetches config when entitled and allowed", () => {
    mocks.hasEntitlement = true;
    mocks.hasAccess = true;
    mocks.useQuery.mockReturnValue({
      data: { config: { enabled: false }, writeMode: "upsert" },
      isLoading: false,
    });

    renderPage();

    expect(screen.getByText("Blob storage form")).toBeInTheDocument();
    expect(screen.queryByText("Loading configuration")).not.toBeInTheDocument();
    expect(mocks.useQuery).toHaveBeenCalledWith(
      { projectId: "proj-1" },
      expect.objectContaining({ enabled: true }),
    );
  });

  it("renders the integration page in Chinese", () => {
    renderPage("zh-CN");

    expect(
      screen.getByRole("heading", { name: "Blob 存储集成" }),
    ).toBeInTheDocument();
    expect(screen.getByText("当前套餐不支持此功能。")).toBeInTheDocument();
  });
});
