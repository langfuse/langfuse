import { renderHook } from "@testing-library/react";
import { useSession } from "next-auth/react";

import { default as useIsFeatureEnabled } from "@/src/features/feature-flags/hooks/useIsFeatureEnabled";
import { useGatewayPages } from "@/src/features/ai-gateway/hooks/useGatewayPages";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { env } from "@/src/env.mjs";
import { organizationRoleAccessRights } from "@langfuse/shared/rbac";
import { Role } from "@langfuse/shared/src/db";

vi.mock("@/src/features/projects/hooks", () => ({
  useQueryProjectOrOrganization: vi.fn(),
}));

vi.mock("@/src/features/rbac/utils/checkOrganizationAccess", () => ({
  useHasOrganizationAccess: vi.fn(),
}));

vi.mock("@/src/features/feature-flags/hooks/useIsFeatureEnabled", () => ({
  default: vi.fn(),
}));

vi.mock("next-auth/react", () => ({ useSession: vi.fn() }));
vi.mock("next/router", () => ({ useRouter: () => ({ query: {} }) }));

const getSetupStatusQuery = vi.hoisted(() => vi.fn());
const getAnalyticsLabelsQuery = vi.hoisted(() => vi.fn());
const listConnectionsQuery = vi.hoisted(() => vi.fn());
const listModelConnectionsQuery = vi.hoisted(() => vi.fn());
vi.mock("@/src/utils/api", () => ({
  api: {
    aiGateway: {
      getSetupStatus: { useQuery: getSetupStatusQuery },
      listApiKeys: { useQuery: () => ({ data: undefined }) },
      getAnalyticsLabels: { useQuery: getAnalyticsLabelsQuery },
      listConnections: { useInfiniteQuery: listConnectionsQuery },
      listModelConnections: { useQuery: listModelConnectionsQuery },
    },
  },
}));

vi.mock(
  "@/src/features/ai-gateway/components/GatewayAnalyticsPage/GatewayAnalyticsPage",
  () => ({ GatewayAnalyticsPage: () => null }),
);
vi.mock(
  "@/src/features/ai-gateway/components/GatewayApiKeysPage/GatewayApiKeysPage",
  () => ({ GatewayApiKeysPage: () => null }),
);
vi.mock(
  "@/src/features/ai-gateway/components/GatewayModelsPage/GatewayModelsPage",
  () => ({ GatewayModelsPage: () => null }),
);
vi.mock(
  "@/src/features/ai-gateway/components/GatewayNotDeployedNotice/GatewayNotDeployedNotice",
  () => ({ GatewayNotDeployedNotice: () => null }),
);

const organization = {
  id: "org-1",
  name: "Org 1",
  metadata: {},
  projects: [],
};

describe("useGatewayPages", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.mocked(useQueryProjectOrOrganization).mockReturnValue({
      organization,
      project: null,
    } as unknown as ReturnType<typeof useQueryProjectOrOrganization>);
    vi.mocked(useHasOrganizationAccess).mockReturnValue(false);
    vi.mocked(useIsFeatureEnabled).mockReturnValue(true);
    vi.mocked(useSession).mockReturnValue({
      data: null,
      status: "unauthenticated",
      update: vi.fn(),
    });
    getSetupStatusQuery.mockReturnValue({
      data: { isConfigured: true },
      isPending: false,
    });
    getAnalyticsLabelsQuery.mockReturnValue({ data: undefined });
    listConnectionsQuery.mockReturnValue({ data: undefined });
    listModelConnectionsQuery.mockReturnValue({ data: undefined });
  });

  it("shows only Models with read access", () => {
    grantScopes("gateway:read");

    expect(visiblePages()).toEqual([["models", false]]);
  });

  it("hides Models for read-only access to the demo organization", () => {
    vi.mocked(useQueryProjectOrOrganization).mockReturnValue({
      organization: { ...organization, id: "demo-org" },
      project: null,
    } as unknown as ReturnType<typeof useQueryProjectOrOrganization>);
    grantScopes("gateway:read");
    const originalDemoOrgId = env.NEXT_PUBLIC_DEMO_ORG_ID;
    Object.assign(env, { NEXT_PUBLIC_DEMO_ORG_ID: "demo-org" });

    try {
      expect(visiblePages()).toEqual([]);
    } finally {
      Object.assign(env, { NEXT_PUBLIC_DEMO_ORG_ID: originalDemoOrgId });
    }
  });

  it("hides every page when the internal flag is disabled", () => {
    vi.mocked(useIsFeatureEnabled).mockReturnValue(false);
    grantScopes("gateway:manage", "gateway:read", "gateway:invoke");

    expect(visiblePages()).toEqual([]);
  });

  it("shows every page to gateway managers", () => {
    grantScopes("gateway:manage", "gateway:read", "gateway:invoke");

    expect(visiblePages()).toEqual([
      ["index", false],
      ["models", false],
      ["api-keys", false],
    ]);
  });

  it("keeps the Models page tabs for managers whose only connection failed", () => {
    grantScopes("gateway:manage", "gateway:read", "gateway:invoke");
    listConnectionsQuery.mockReturnValue({
      data: { pages: [{ data: [{ id: "conn-1", status: "ERROR" }] }] },
    });
    listModelConnectionsQuery.mockReturnValue({ data: [] });

    const { result } = renderHook(() => useGatewayPages());
    const models = result.current.find(({ slug }) => slug === "models");

    expect(models?.tabsProps).toBeDefined();
  });

  it("disables Models and Gateway keys for managers until ingestion is set up", () => {
    grantScopes("gateway:manage", "gateway:read", "gateway:invoke");
    getSetupStatusQuery.mockReturnValue({
      data: { isConfigured: false },
      isPending: false,
    });

    expect(visiblePages()).toEqual([
      ["index", false],
      ["models", true],
      ["api-keys", true],
    ]);
  });

  it("hides the Overview title for managers while the setup guide is shown", () => {
    grantScopes("gateway:manage", "gateway:read", "gateway:invoke");
    getSetupStatusQuery.mockReturnValue({
      data: { isConfigured: false },
      isPending: false,
    });
    const { result, rerender } = renderHook(() => useGatewayPages());
    const overviewHidesTitle = () =>
      result.current.find((page) => page.slug === "index")?.hideTitle;

    expect(overviewHidesTitle()).toBe(true);

    getSetupStatusQuery.mockReturnValue({
      data: { isConfigured: true },
      isPending: false,
    });
    rerender();

    expect(overviewHidesTitle()).toBe(true);

    // Overview and the other gateway pages are separate routes, so leaving Overview remounts it.
    const remounted = renderHook(() => useGatewayPages());
    expect(
      remounted.result.current.find((page) => page.slug === "index")?.hideTitle,
    ).toBe(true);
  });

  it("keeps Models enabled for readers when ingestion is not set up", () => {
    grantScopes("gateway:read");
    getSetupStatusQuery.mockReturnValue({
      data: { isConfigured: false },
      isPending: false,
    });

    expect(visiblePages()).toEqual([["models", false]]);
  });

  it("shows AI_GATEWAY members their keys, models and own analytics, even before ingestion is set up", () => {
    grantScopesOf(Role.AI_GATEWAY);
    getSetupStatusQuery.mockReturnValue({
      data: { isConfigured: false },
      isPending: false,
    });

    expect(visiblePages()).toEqual([
      ["index", false],
      ["models", false],
      ["api-keys", false],
    ]);
  });

  it("drops the Gateway keys title actions while a member's first-key placeholder shows them", () => {
    grantScopesOf(Role.MEMBER);
    const keysPageActions = () =>
      renderHook(() => useGatewayPages()).result.current.find(
        (page) => page.slug === "api-keys",
      )?.actions;

    getAnalyticsLabelsQuery.mockReturnValue({
      data: { apiKeys: [], users: [] },
    });
    expect(keysPageActions()).toBeUndefined();

    getAnalyticsLabelsQuery.mockReturnValue({
      data: { apiKeys: [{ id: "key-1", label: "My key" }], users: [] },
    });
    expect(keysPageActions()).toBeDefined();
  });

  it("does not load analytics labels for VIEWER members, who cannot invoke the gateway", () => {
    grantScopesOf(Role.VIEWER);
    renderHook(() => useGatewayPages());

    expect(getAnalyticsLabelsQuery).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ enabled: false }),
    );
  });

  it("shows managers no Overview filters or ingestion button while the gateway is not deployed", () => {
    grantScopes("gateway:manage", "gateway:read", "gateway:invoke");
    vi.mocked(useSession).mockReturnValue({
      data: { environment: { aiGatewayDeployed: false } },
      status: "authenticated",
      update: vi.fn(),
    } as unknown as ReturnType<typeof useSession>);

    const overview = renderHook(() => useGatewayPages()).result.current.find(
      (page) => page.slug === "index",
    );

    expect(overview?.actionsLeft).toBeUndefined();
    expect(overview?.actions).toBeUndefined();
  });

  it("keeps gateway analytics from MEMBER members, who read organization settings", () => {
    grantScopesOf(Role.MEMBER);

    expect(visiblePages().map(([slug]) => slug)).toEqual([
      "models",
      "api-keys",
    ]);
  });
});

function grantScopes(...scopes: string[]) {
  vi.mocked(useHasOrganizationAccess).mockImplementation(({ scope }) =>
    scopes.includes(scope),
  );
}

function grantScopesOf(role: Role) {
  vi.mocked(useHasOrganizationAccess).mockImplementation(({ scope }) =>
    organizationRoleAccessRights[role].includes(scope),
  );
}

function visiblePages() {
  const { result } = renderHook(() => useGatewayPages());
  return result.current
    .filter((page) => page.show)
    .map((page) => [page.slug, !!page.disabledReason] as const);
}
