import { buildSettingsPages } from "@/src/features/settings/SettingsPage";

vi.mock("@/src/features/account", () => ({
  useAccountSettingsPages: () => [],
}));

vi.mock("@/src/features/organizations/OrganizationSettingsPage", () => ({
  useOrganizationSettingsPages: () => [],
}));

const accountPages = [
  { title: "General", slug: "index", content: "account general" },
  { title: "v4 Migration", slug: "v4-migration", href: "/v4-migration" },
];

const organizationPages = [
  {
    title: "General",
    slug: "index",
    section: "Organization",
    content: "org general",
  },
  {
    title: "Billing",
    slug: "billing",
    section: "Organization",
    content: "billing",
  },
  {
    title: "Projects",
    slug: "projects",
    section: "Organization",
    href: "/organization/org-1",
  },
  {
    title: "v4 Migration",
    slug: "v4-migration",
    section: "Organization",
    href: "/v4-migration",
  },
];

const summarize = (pages: ReturnType<typeof buildSettingsPages>) =>
  pages.map((page) => ({
    section: page.section,
    slug: page.slug,
    ...("href" in page
      ? { href: page.href, internal: page.internal ?? false }
      : { content: true }),
  }));

describe("buildSettingsPages", () => {
  it("links organization pages from the account route", () => {
    const pages = buildSettingsPages({
      scope: "account",
      organizationId: "org-1",
      accountPages,
      organizationPages,
    });

    expect(summarize(pages)).toEqual([
      { section: "Account", slug: "index", content: true },
      {
        section: "Account",
        slug: "v4-migration",
        href: "/v4-migration",
        internal: false,
      },
      {
        section: "Organization",
        slug: "index",
        href: "/organization/org-1/settings",
        internal: true,
      },
      {
        section: "Organization",
        slug: "billing",
        href: "/organization/org-1/settings/billing",
        internal: true,
      },
      {
        section: "Organization",
        slug: "projects",
        href: "/organization/org-1",
        internal: false,
      },
    ]);
  });

  it("links account pages from the organization route, keeping the org", () => {
    const pages = buildSettingsPages({
      scope: "organization",
      organizationId: "org-1",
      accountPages,
      organizationPages,
    });

    expect(summarize(pages)).toEqual([
      {
        section: "Account",
        slug: "index",
        href: "/account/settings?organizationId=org-1",
        internal: true,
      },
      {
        section: "Account",
        slug: "v4-migration",
        href: "/v4-migration",
        internal: false,
      },
      { section: "Organization", slug: "index", content: true },
      { section: "Organization", slug: "billing", content: true },
      {
        section: "Organization",
        slug: "projects",
        href: "/organization/org-1",
        internal: false,
      },
    ]);
  });
});
