import { type OrganizationOverviewDisplayOrganization } from "@/src/features/organizations/components/OrganizationOverviewView";

export type OrganizationOverviewPlaygroundScenario = {
  key: string;
  label: string;
  description: string;
  canCreateOrg: boolean;
  selectedOrganizationId?: string;
  initialSearch?: string;
  organizations: OrganizationOverviewDisplayOrganization[];
};

// DEV ONLY: mock states for the organization overview design playground route.
export const organizationOverviewPlaygroundScenarios: OrganizationOverviewPlaygroundScenario[] =
  [
    {
      key: "portfolio",
      label: "Portfolio",
      description:
        "Default multi-organization portfolio with active, deleted, and demo projects.",
      canCreateOrg: true,
      organizations: [
        {
          id: "design-org-1",
          name: "North Star AI",
          role: "OWNER",
          plan: "cloud:pro",
          cloudConfig: undefined,
          aiFeaturesEnabled: true,
          metadata: {},
          canCreateProject: true,
          canViewMembers: true,
          isDemoOrg: false,
          projects: [
            {
              id: "design-project-1",
              name: "Support Copilot",
              role: "ADMIN",
              retentionDays: 30,
              hasTraces: true,
              deletedAt: null,
              metadata: {},
            },
            {
              id: "design-project-2",
              name: "Routing Evaluator",
              role: "ADMIN",
              retentionDays: 14,
              hasTraces: true,
              deletedAt: null,
              metadata: {},
            },
            {
              id: "design-project-3",
              name: "Knowledge Base Rebuild",
              role: "ADMIN",
              retentionDays: 7,
              hasTraces: false,
              deletedAt: new Date("2026-03-30T10:00:00.000Z").toISOString(),
              metadata: {},
            },
          ],
        },
        {
          id: "design-org-2",
          name: "Acme Research",
          role: "MEMBER",
          plan: "cloud:hobby",
          cloudConfig: undefined,
          aiFeaturesEnabled: false,
          metadata: {},
          canCreateProject: false,
          canViewMembers: true,
          isDemoOrg: false,
          projects: [
            {
              id: "design-project-4",
              name: "Assistant Bench",
              role: "VIEWER",
              retentionDays: 30,
              hasTraces: true,
              deletedAt: null,
              metadata: {},
            },
            {
              id: "design-project-5",
              name: "Translation QA",
              role: "VIEWER",
              retentionDays: 30,
              hasTraces: true,
              deletedAt: null,
              metadata: {},
            },
          ],
        },
        {
          id: "demo-org-id",
          name: "Langfuse Demo",
          role: "OWNER",
          plan: "cloud:hobby",
          cloudConfig: undefined,
          aiFeaturesEnabled: true,
          metadata: {},
          canCreateProject: true,
          canViewMembers: true,
          isDemoOrg: true,
          projects: [
            {
              id: "demo-project-id",
              name: "Demo Project",
              role: "ADMIN",
              retentionDays: 30,
              hasTraces: true,
              deletedAt: null,
              metadata: {},
            },
          ],
        },
      ],
    },
    {
      key: "single-org",
      label: "Single org",
      description:
        "Single organization detail state, useful for focused redesign of the inner org view.",
      canCreateOrg: true,
      selectedOrganizationId: "design-org-1",
      organizations: [
        {
          id: "design-org-1",
          name: "North Star AI",
          role: "OWNER",
          plan: "cloud:pro",
          cloudConfig: undefined,
          aiFeaturesEnabled: true,
          metadata: {},
          canCreateProject: true,
          canViewMembers: true,
          isDemoOrg: false,
          projects: [
            {
              id: "design-project-1",
              name: "Support Copilot",
              role: "ADMIN",
              retentionDays: 30,
              hasTraces: true,
              deletedAt: null,
              metadata: {},
            },
            {
              id: "design-project-2",
              name: "Routing Evaluator",
              role: "ADMIN",
              retentionDays: 14,
              hasTraces: true,
              deletedAt: null,
              metadata: {},
            },
          ],
        },
      ],
    },
    {
      key: "search",
      label: "Search state",
      description:
        "Pre-filled search state for testing density, empty states, and filtering behavior.",
      canCreateOrg: true,
      initialSearch: "routing",
      organizations: [
        {
          id: "design-org-1",
          name: "North Star AI",
          role: "OWNER",
          plan: "cloud:pro",
          cloudConfig: undefined,
          aiFeaturesEnabled: true,
          metadata: {},
          canCreateProject: true,
          canViewMembers: true,
          isDemoOrg: false,
          projects: [
            {
              id: "design-project-1",
              name: "Support Copilot",
              role: "ADMIN",
              retentionDays: 30,
              hasTraces: true,
              deletedAt: null,
              metadata: {},
            },
            {
              id: "design-project-2",
              name: "Routing Evaluator",
              role: "ADMIN",
              retentionDays: 14,
              hasTraces: true,
              deletedAt: null,
              metadata: {},
            },
          ],
        },
        {
          id: "design-org-2",
          name: "Acme Research",
          role: "MEMBER",
          plan: "cloud:hobby",
          cloudConfig: undefined,
          aiFeaturesEnabled: false,
          metadata: {},
          canCreateProject: false,
          canViewMembers: true,
          isDemoOrg: false,
          projects: [
            {
              id: "design-project-3",
              name: "Translation QA",
              role: "VIEWER",
              retentionDays: 30,
              hasTraces: true,
              deletedAt: null,
              metadata: {},
            },
          ],
        },
      ],
    },
    {
      key: "onboarding",
      label: "Onboarding",
      description:
        "Empty state for exploring first-run onboarding treatment without auth or backend setup.",
      canCreateOrg: true,
      organizations: [],
    },
  ];
