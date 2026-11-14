import { OrganizationLandingService } from "@/src/features/organizations/server/organizationLandingService";
import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import {
  testSession,
  type TestOrganization,
} from "@/src/__tests__/fixtures/principal";

vi.mock("@/src/env.mjs", async (importOriginal) => {
  const actual = await importOriginal<{ env: Record<string, unknown> }>();
  return { env: { ...actual.env, NEXT_PUBLIC_DEMO_ORG_ID: "org-demo" } };
});

const organization = (
  id: string,
  overrides: Partial<TestOrganization> = {},
): TestOrganization => ({
  id,
  name: id,
  role: "MEMBER",
  plan: "oss",
  projects: [{ id: `${id}-project`, role: "MEMBER" }],
  featureFlagDefaults: testFeatureFlags(),
  ...overrides,
});

const session = (organizations: TestOrganization[]) =>
  testSession({
    user: { featureFlags: testFeatureFlags() },
    organizations,
    environment: { aiGatewayDeployed: true },
  });

const demoOrganization = organization("org-demo");
const gatewayOnlyOrganization = organization("org-gateway", {
  role: "AI_GATEWAY",
  projects: [],
  featureFlagDefaults: testFeatureFlags({ aiGateway: true }),
});

it.each([
  {
    name: "the last visited project's org",
    organizations: [organization("org-a"), organization("org-b")],
    lastProjectId: "org-b-project",
    expected: "/organization/org-b",
  },
  {
    name: "the first non-demo org without a usable cookie",
    organizations: [demoOrganization, organization("org-a")],
    lastProjectId: "unknown-project",
    expected: "/organization/org-a",
  },
  {
    name: "the projects page for gateway-only members",
    organizations: [gatewayOnlyOrganization],
    lastProjectId: null,
    expected: "/organization/org-gateway",
  },
  {
    name: "a usable org before a gateway-only org without the gateway",
    organizations: [
      organization("org-gateway-off", { role: "AI_GATEWAY", projects: [] }),
      organization("org-a"),
    ],
    lastProjectId: null,
    expected: "/organization/org-a",
  },
  {
    name: "nothing when only the demo org is left",
    organizations: [demoOrganization],
    lastProjectId: null,
    expected: null,
  },
])("lands on $name", ({ organizations, lastProjectId, expected }) => {
  expect(
    new OrganizationLandingService(session(organizations)).landingPath(
      lastProjectId,
    ),
  ).toBe(expected);
});
