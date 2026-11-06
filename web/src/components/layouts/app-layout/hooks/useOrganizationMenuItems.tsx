import { useSession } from "next-auth/react";
import { type Session } from "next-auth";
import { Check, PlusIcon } from "@langfuse/icons";
import { isCloudPlan, planLabels } from "@langfuse/shared";

import { Badge } from "@/src/components/design-system/Badge/Badge";
import { type UserNavigationItem } from "@/src/components/nav/AppSidebar/AppSidebar";
import { env } from "@/src/env.mjs";
import { createOrganizationRoute } from "@/src/features/setup/setupRoutes";

type LeafItem = Exclude<UserNavigationItem, { type: "submenu" }>;

type Organization = NonNullable<Session["user"]>["organizations"][number];

/** Org switching lives in the profile menu: the current org opens a list of all orgs. */
export function useOrganizationMenuItems(
  currentOrganizationId: string | undefined,
) {
  const session = useSession();
  return buildOrganizationMenuItems({
    organizations: session.data?.user?.organizations ?? [],
    currentOrganizationId,
    canCreateOrganizations: !!session.data?.user?.canCreateOrganizations,
  });
}

export function buildOrganizationMenuItems({
  organizations: unsortedOrganizations,
  currentOrganizationId,
  canCreateOrganizations,
}: {
  organizations: Organization[];
  currentOrganizationId: string | undefined;
  canCreateOrganizations: boolean;
}): UserNavigationItem[] {
  const organizations = unsortedOrganizations.toSorted(
    (a, b) =>
      Number(a.id === env.NEXT_PUBLIC_DEMO_ORG_ID) -
      Number(b.id === env.NEXT_PUBLIC_DEMO_ORG_ID),
  );
  if (organizations.length === 0) return [];

  const current = organizations.find((org) => org.id === currentOrganizationId);

  const orgLinks = organizations.map(
    (organization): LeafItem => ({
      type: "link",
      name: `org-${organization.id}`,
      href: `/organization/${organization.id}`,
      content: (
        <OrganizationRow
          organization={organization}
          isCurrent={organization.id === current?.id}
        />
      ),
    }),
  );
  const createOrg: LeafItem[] = canCreateOrganizations
    ? [
        { type: "separator", name: "create-organization-separator" },
        {
          type: "link",
          name: "New organization",
          href: createOrganizationRoute,
          content: <NewOrganizationRow />,
        },
      ]
    : [];

  if (!current) {
    return [
      { type: "label", name: "Organizations" },
      ...orgLinks,
      ...createOrg,
      { type: "separator", name: "organization-separator" },
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
        ...createOrg,
      ],
    },
    {
      type: "link",
      name: "Org settings",
      href: `/organization/${current.id}/settings`,
    },
    { type: "separator", name: "organization-separator" },
  ];
}

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

/** The name with its plan badge pushed to the right. */
function OrganizationName({ organization }: { organization: Organization }) {
  const { plan } = organization;
  const planLabel =
    isCloudPlan(plan) && organization.id !== env.NEXT_PUBLIC_DEMO_ORG_ID
      ? planLabels[plan]
      : null;
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <span className="ph-no-capture truncate" title={organization.name}>
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

function NewOrganizationRow() {
  return (
    <span className="text-muted-foreground flex w-full min-w-0 items-center gap-2">
      <span className="flex w-3.5 shrink-0 items-center">
        <PlusIcon size="sm" />
      </span>
      New organization
    </span>
  );
}
