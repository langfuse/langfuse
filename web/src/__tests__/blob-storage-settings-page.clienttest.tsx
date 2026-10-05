import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

const mocks = vi.hoisted(() => ({
  hasAccess: true,
  hasEntitlement: false,
  push: vi.fn(),
  routerQuery: {
    projectId: "proj-1",
    integrationId: undefined as string | undefined,
  },
  useQuery: vi.fn(),
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    query: mocks.routerQuery,
    pathname: "/project/[projectId]/settings/integrations/blob-storage",
    push: mocks.push,
  }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/src/components/layouts/container-page", () => ({
  default: ({
    children,
    headerProps,
  }: {
    children: ReactNode;
    headerProps: {
      title: string;
      actionButtonsLeft?: ReactNode;
      actionButtonsRight?: ReactNode;
    };
  }) => (
    <div>
      <h1>{headerProps.title}</h1>
      {headerProps.actionButtonsLeft}
      {headerProps.actionButtonsRight}
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
  Button: ({
    asChild,
    children,
    onClick,
    variant = "default",
  }: {
    asChild?: boolean;
    children: ReactNode;
    onClick?: () => void;
    variant?: string;
  }) =>
    asChild ? (
      children
    ) : (
      <button data-variant={variant} onClick={onClick}>
        {children}
      </button>
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
  "@/src/features/blobstorage-integration/components/BlobStorageIntegrationTable",
  () => ({
    BlobStorageIntegrationTable: () => <div>Blob storage table</div>,
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

vi.mock("@/src/features/feature-flags/hooks/useIsFeatureEnabled", () => ({
  default: () => false,
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    useUtils: () => ({
      blobStorageIntegration: {
        invalidate: vi.fn(),
      },
    }),
    blobStorageIntegration: {
      get: {
        useQuery: mocks.useQuery,
      },
      delete: {
        useMutation: () => ({
          error: null,
          isPending: false,
          mutateAsync: vi.fn(),
          reset: vi.fn(),
        }),
      },
    },
  },
}));

import BlobStorageIntegrationPage from "@/src/features/blobstorage-integration/BlobStorageIntegrationPage";

describe("BlobStorageIntegrationPage entitlement gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasAccess = true;
    mocks.hasEntitlement = false;
    mocks.routerQuery.integrationId = undefined;
    mocks.useQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
    });
  });

  it("does not fetch config and shows a plan message without scheduled-blob-exports", () => {
    render(<BlobStorageIntegrationPage />);

    expect(
      screen.getByText("This feature is not available in your current plan."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Loading configuration")).not.toBeInTheDocument();
    expect(screen.queryByText("Blob storage table")).not.toBeInTheDocument();
    expect(mocks.useQuery).toHaveBeenCalledWith(
      { projectId: "proj-1" },
      expect.objectContaining({ enabled: false }),
    );
  });

  it("shows the role message when entitled but without integrations access", () => {
    mocks.hasEntitlement = true;
    mocks.hasAccess = false;

    render(<BlobStorageIntegrationPage />);

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
      data: { configs: [], config: null, writeMode: "upsert" },
      isLoading: false,
    });

    render(<BlobStorageIntegrationPage />);

    expect(screen.getByText("Blob storage table")).toBeInTheDocument();
    expect(screen.queryByText("Loading configuration")).not.toBeInTheDocument();
    expect(mocks.useQuery).toHaveBeenCalledWith(
      { projectId: "proj-1" },
      expect.objectContaining({ enabled: true }),
    );
  });
});

describe("BlobStorageIntegrationPage header actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasAccess = true;
    mocks.hasEntitlement = true;
    mocks.routerQuery.integrationId = undefined;
    mocks.useQuery.mockReturnValue({
      data: {
        configs: [
          {
            id: "integration-id",
            bucketName: "bucket",
            enabled: true,
            lastError: null,
            lastSyncAt: null,
            nextSyncAt: null,
            runStartedAt: null,
          },
        ],
        writeMode: "upsert",
      },
      isLoading: false,
    });
  });

  it("shows the primary add action beside the secondary docs action on the list", () => {
    render(<BlobStorageIntegrationPage />);

    const docs = screen.getByRole("link", { name: "Integration Docs ↗" });
    const add = screen.getByRole("button", { name: "Add integration" });

    expect(docs).toHaveAttribute(
      "href",
      "https://langfuse.com/docs/api-and-data-platform/features/export-to-blob-storage",
    );
    expect(add).toHaveAttribute("data-variant", "default");

    fireEvent.click(add);

    expect(mocks.push).toHaveBeenCalledWith(
      {
        pathname: "/project/[projectId]/settings/integrations/blob-storage",
        query: { projectId: "proj-1", integrationId: "new" },
      },
      undefined,
      { shallow: true },
    );
  });

  it.each(["new", "integration-id"])(
    "hides the add action on the %s integration detail",
    (integrationId) => {
      mocks.routerQuery.integrationId = integrationId;

      render(<BlobStorageIntegrationPage />);

      expect(
        screen.queryByRole("button", { name: "Add integration" }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Integration Docs ↗" }),
      ).toBeInTheDocument();
    },
  );
});
