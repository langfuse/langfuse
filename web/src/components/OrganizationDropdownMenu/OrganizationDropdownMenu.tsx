import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { PlusIcon, Settings } from "lucide-react";
import { type Session } from "next-auth";
import { type ComponentProps, useMemo } from "react";
import { env } from "@/src/env.mjs";
import { createOrganizationRoute } from "@/src/features/setup";

type Organization = NonNullable<Session["user"]>["organizations"][number];

type OrganizationDropdownMenuProps = {
  children: ComponentProps<typeof DropdownMenu>["children"];
  canCreateOrganizations: boolean;
  getOrgPath: (organizationId: string) => string;
} & (
  | { state: "loading" }
  | {
      state: "loaded";
      organizations: Organization[];
    }
);

export function OrganizationDropdownMenu(props: OrganizationDropdownMenuProps) {
  const { canCreateOrganizations, children, getOrgPath } = props;
  const organizations = props.state === "loaded" ? props.organizations : null;

  const items = useMemo<ComponentProps<typeof DropdownMenu>["items"]>(
    () => [
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
              href: createOrganizationRoute,
              icon: PlusIcon,
            },
          ]
        : []),
    ],
    [canCreateOrganizations, getOrgPath, organizations],
  );

  return (
    <DropdownMenu title="Organizations" items={items}>
      {children}
    </DropdownMenu>
  );
}
