import { useSession } from "next-auth/react";
import { type Session } from "next-auth";
import { Check, PlusIcon } from "@langfuse/icons";
import { isCloudPlan, planLabels } from "@langfuse/shared";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { type UserNavigationItem } from "@/src/components/nav/AppSidebar/AppSidebar";
import { env } from "@/src/env.mjs";
import { useOrgProjectSwitchPaths } from "@/src/features/projects/hooks";
import { createOrganizationRoute } from "@/src/features/setup/setupRoutes";

type LinkItem = Extract<UserNavigationItem, { type: "link" }>;

type Organization = NonNullable<Session["user"]>["organizations"][number];

function OrganizationRow({
  organization,
  isCurrent,
}: {
  organization: Organization;
  isCurrent: boolean;
}) {
  return (
    <span className="flex w-full min-w-0 items-center gap-2">
      <span className="text-dark-green flex w-3.5 shrink-0 items-center">
        {isCurrent && (
          <Check size="sm" color="inherit" aria-label="Current organization" />
        )}
      </span>
      <OrganizationName organization={organization} />
    </span>
  );
}

/** OrganizationName renders the name with its plan badge pushed to the right. */
function OrganizationName({ organization }: { organization: Organization }) {
  const planLabel =
    isCloudPlan(organization.plan) &&
    organization.id !== env.NEXT_PUBLIC_DEMO_ORG_ID
      ? planLabels[organization.plan]
      : undefined;
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <span className="truncate" title={organization.name}>
        {organization.name}
      </span>
      {planLabel && (
        <span className="ml-auto shrink-0">
          <Badge color="filled" size="sm" text={planLabel} />
        </span>
      )}
    </span>
  );
}

/** Org switching lives in the profile menu: the current org opens a list of all orgs. */
export function useOrganizationMenuItems(
  currentOrganizationId: string | undefined,
): UserNavigationItem[] {
  const session = useSession();
  const { getOrgPath } = useOrgProjectSwitchPaths();

  const organizations = [...(session.data?.user?.organizations ?? [])].sort(
    (a, b) =>
      Number(a.id === env.NEXT_PUBLIC_DEMO_ORG_ID) -
      Number(b.id === env.NEXT_PUBLIC_DEMO_ORG_ID),
  );
  const current = organizations.find((org) => org.id === currentOrganizationId);
  const canCreateOrganizations = !!session.data?.user?.canCreateOrganizations;

  const orgLinks = organizations.map(
    (organization): LinkItem => ({
      type: "link",
      name: `org-${organization.id}`,
      href: getOrgPath(organization.id),
      content: (
        <OrganizationRow
          organization={organization}
          isCurrent={organization.id === current?.id}
        />
      ),
    }),
  );
  const createOrgLink: LinkItem = {
    type: "link",
    name: "New organization",
    href: createOrganizationRoute,
    content: (
      <span className="text-muted-foreground flex w-full min-w-0 items-center gap-2">
        <span className="flex w-3.5 shrink-0 items-center">
          <PlusIcon size="sm" />
        </span>
        New organization
      </span>
    ),
  };
  const createOrg: UserNavigationItem[] = canCreateOrganizations
    ? [createOrgLink]
    : [];
  const orgSettings: UserNavigationItem[] = current
    ? [
        {
          type: "link",
          name: "Org settings",
          href: `/organization/${current.id}/settings`,
        },
      ]
    : [];

  if (organizations.length === 0) return [];

  if (!current) {
    return [
      { type: "label", name: "Organizations" },
      ...orgLinks,
      ...createOrg,
      { type: "separator", name: "org-list-separator" },
    ];
  }

  return [
    { type: "label", name: "Organization" },
    {
      type: "submenu",
      name: "Switch organization",
      content: <OrganizationName organization={current} />,
      subItems: [
        { type: "label", name: "Switch organization" },
        ...orgLinks,
        ...(canCreateOrganizations
          ? [
              { type: "separator" as const, name: "create-separator" },
              createOrgLink,
            ]
          : []),
      ],
    },
    ...orgSettings,
    { type: "separator", name: "org-separator" },
  ];
}
