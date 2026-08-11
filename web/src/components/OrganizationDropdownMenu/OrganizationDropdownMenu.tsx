import {
  DropdownMenuContent,
  DropdownMenuItemWithSecondaryAction,
  DropdownMenuSeparator,
  DropdownMenuLoadingItem,
} from "@/src/components/ui/dropdown-menu";
import { PlusIcon, Settings } from "lucide-react";
import { type Session } from "next-auth";
import { Fragment } from "react";
import { env } from "@/src/env.mjs";
import { createOrganizationRoute } from "@/src/features/setup/setupRoutes";

type Organization = NonNullable<Session["user"]>["organizations"][number];

type OrganizationDropdownMenuProps = {
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
  const { canCreateOrganizations, getOrgPath } = props;

  return (
    <DropdownMenuContent align="start" header="Organizations" maxHeight="15rem">
      {props.state === "loaded" ? (
        [...props.organizations]
          .sort((a, b) => {
            // sort demo org to the bottom
            const isDemoA = env.NEXT_PUBLIC_DEMO_ORG_ID === a.id;
            const isDemoB = env.NEXT_PUBLIC_DEMO_ORG_ID === b.id;
            if (isDemoA) return 1;
            if (isDemoB) return -1;
            return 0;
          })
          .map((dropdownOrg) => (
            <Fragment key={dropdownOrg.id}>
              {env.NEXT_PUBLIC_DEMO_ORG_ID === dropdownOrg.id && (
                <DropdownMenuSeparator />
              )}
              <DropdownMenuItemWithSecondaryAction
                title={dropdownOrg.name}
                href={getOrgPath(dropdownOrg.id)}
                secondaryAction={{
                  href: `/organization/${dropdownOrg.id}/settings`,
                  ariaLabel: `Go to settings for ${dropdownOrg.name}`,
                  icon: Settings,
                }}
              />
            </Fragment>
          ))
      ) : (
        <DropdownMenuLoadingItem />
      )}

      {canCreateOrganizations && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItemWithSecondaryAction
            title="New Organization"
            href={createOrganizationRoute}
            icon={PlusIcon}
          />
        </>
      )}
    </DropdownMenuContent>
  );
}
