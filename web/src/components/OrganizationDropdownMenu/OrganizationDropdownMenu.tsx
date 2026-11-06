import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { PlusIcon, Settings } from "@langfuse/icons";
import { type Session } from "next-auth";
import { type ComponentProps, useMemo } from "react";
import { env } from "@/src/env.mjs";
import { createOrganizationRoute } from "@/src/features/setup/setupRoutes";

type Organization = NonNullable<Session["user"]>["organizations"][number];

type OrganizationDropdownMenuProps = {
  children: ComponentProps<typeof DropdownMenu>["children"];
  canCreateOrganizations: boolean;
  getOrgPath: (organizationId: string) => string;
  /** Link shown above the org list, e.g. back to the current org's projects. */
  leadingItem?: { title: string; href: string };
} & (
  | { state: "loading" }
  | {
      state: "loaded";
      organizations: Organization[];
    }
);

export function OrganizationDropdownMenu(props: OrganizationDropdownMenuProps) {
  const { canCreateOrganizations, children, getOrgPath, leadingItem } = props;
  const organizations = props.state === "loaded" ? props.organizations : null;

  const items = useMemo<ComponentProps<typeof DropdownMenu>["items"]>(
    () => [
      ...(leadingItem
        ? [
            {
              type: "item" as const,
              id: "leading",
              title: leadingItem.title,
              searchBehavior: "always-show" as const,
              href: leadingItem.href,
            },
            { type: "separator" as const, id: "leading-separator" },
          ]
        : []),
      ...(organizations
        ? [...organizations]
            .sort((a, b) => {
              const isDemoA = env.NEXT_PUBLIC_DEMO_ORG_ID === a.id;
              const isDemoB = env.NEXT_PUBLIC_DEMO_ORG_ID === b.id;
              if (isDemoA) return 1;
              if (isDemoB) return -1;
              return 0;
            })
            .flatMap((organization) => [
              ...(env.NEXT_PUBLIC_DEMO_ORG_ID === organization.id
                ? [{ type: "separator" as const, id: "demo-separator" }]
                : []),
              {
                type: "item" as const,
                id: organization.id,
                title: organization.name,
                href: getOrgPath(organization.id),
                secondaryAction: {
                  href: `/organization/${organization.id}/settings`,
                  ariaLabel: `Go to settings for ${organization.name}`,
                  icon: Settings,
                },
              },
            ])
        : [{ type: "loading" as const, id: "loading" }]),
      ...(canCreateOrganizations
        ? [
            { type: "separator" as const, id: "create-separator" },
            {
              type: "item" as const,
              id: "create",
              title: "New Organization",
              searchBehavior: "always-show" as const,
              href: createOrganizationRoute,
              icon: PlusIcon,
            },
          ]
        : []),
    ],
    [canCreateOrganizations, getOrgPath, leadingItem, organizations],
  );

  return (
    <DropdownMenu
      title="Organizations"
      items={items}
      search={{ placeholder: "Search organizations..." }}
      emptyText="No organization found."
    >
      {children}
    </DropdownMenu>
  );
}
