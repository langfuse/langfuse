import { type ComponentProps } from "react";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import { PagedSettingsContainer } from "@/src/components/PagedSettingsContainer";
import ContainerPage from "@/src/components/layouts/container-page";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import { OrganizationDropdownMenu } from "@/src/components/OrganizationDropdownMenu/OrganizationDropdownMenu";
import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { useAccountSettingsPages } from "@/src/features/account";
import { useQueryOrganization } from "@/src/features/organizations";
import { useOrganizationSettingsPages } from "@/src/features/organizations/OrganizationSettingsPage";
import { useOrgProjectSwitchPaths } from "@/src/features/projects";
import { accountSettingsPath } from "@/src/features/settings/accountSettingsPath";

type SettingsScope = "account" | "organization";

type SettingsPageProps = { scope: SettingsScope };

type OrganizationPickerProps = { scope: SettingsScope };

type SettingsPageEntry = ComponentProps<
  typeof PagedSettingsContainer
>["pages"][number];

const ACCOUNT_SECTION = "Account";
const ORGANIZATION_SECTION = "Organization";

export function SettingsPage({ scope }: SettingsPageProps) {
  const router = useRouter();
  const organization = useQueryOrganization();
  const accountPages = useAccountSettingsPages();
  const organizationPages = useOrganizationSettingsPages();

  const pages = buildSettingsPages({
    scope,
    organizationId: organization?.id,
    accountPages,
    organizationPages,
  });

  const activeSlug =
    typeof router.query.page === "string" ? router.query.page : undefined;
  const fullHeight =
    scope === "organization" && activeSlug === "ai-gateway-models";

  if (scope === "organization" && !organization) {
    return (
      <ContainerPage headerProps={{ title: "Settings" }}>
        <NoDataOrLoading isLoading />
      </ContainerPage>
    );
  }

  return (
    <ContainerPage
      headerProps={{ title: "Settings" }}
      extendRight={fullHeight}
      fullHeight={fullHeight}
    >
      <PagedSettingsContainer
        activeSlug={activeSlug}
        pages={pages}
        fullHeight={fullHeight}
        sectionHeaders={{
          [ORGANIZATION_SECTION]: <OrganizationPicker scope={scope} />,
        }}
      />
    </ContainerPage>
  );
}

function OrganizationPicker({ scope }: OrganizationPickerProps) {
  const session = useSession();
  const organization = useQueryOrganization();
  const { getOrgPath: getOrgSwitchPath } = useOrgProjectSwitchPaths();
  const organizations = session.data?.user?.organizations;
  const organizationLabel = organization?.name ?? "Select organization";

  return (
    <OrganizationDropdownMenu
      {...(organizations
        ? { state: "loaded", organizations }
        : { state: "loading" })}
      canCreateOrganizations={!!session.data?.user?.canCreateOrganizations}
      getOrgPath={scope === "account" ? accountSettingsPath : getOrgSwitchPath}
    >
      {({ getTriggerProps }) => (
        <button
          type="button"
          className="text-muted-foreground hover:bg-muted hover:text-foreground flex h-8 w-full items-center gap-1.5 rounded-sm px-2 text-left text-xs font-bold"
          {...getTriggerProps()}
        >
          <span className="truncate" title={organizationLabel}>
            {organizationLabel}
          </span>
          <DropdownIndicator size="sm" nudge />
        </button>
      )}
    </OrganizationDropdownMenu>
  );
}

const organizationSettingsPath = (organizationId: string, slug: string) =>
  `/organization/${organizationId}/settings${slug === "index" ? "" : `/${slug}`}`;

/**
 * Merges account and organization settings into one nav. Pages owned by the
 * other route become internal links, so each route only renders its own
 * content while the nav looks the same on both.
 */
export function buildSettingsPages({
  scope,
  organizationId,
  accountPages,
  organizationPages,
}: {
  scope: SettingsScope;
  organizationId: string | undefined;
  accountPages: SettingsPageEntry[];
  organizationPages: SettingsPageEntry[];
}): SettingsPageEntry[] {
  const account = accountPages.map((page): SettingsPageEntry => {
    const base = { ...page, section: ACCOUNT_SECTION };
    if (scope === "account" || !("content" in page)) return base;
    return {
      title: page.title,
      slug: page.slug,
      section: ACCOUNT_SECTION,
      show: page.show,
      href: accountSettingsPath(organizationId),
      internal: true,
    };
  });

  /** Org links the account section already has, e.g. v4 Migration */
  const accountHrefs = new Set(
    accountPages.flatMap((page) => ("href" in page ? [page.href] : [])),
  );

  const organization = organizationPages
    .filter((page) => !("href" in page && accountHrefs.has(page.href)))
    .map((page): SettingsPageEntry => {
      if (scope === "organization" || !("content" in page) || !organizationId)
        return page;
      return {
        title: page.title,
        slug: page.slug,
        section: page.section,
        show: page.show,
        href: organizationSettingsPath(organizationId, page.slug),
        internal: true,
      };
    });

  return [...account, ...organization];
}
