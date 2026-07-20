import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuLoadingItem,
} from "@/src/components/ui/dropdown-menu";
import { PlusIcon, Settings } from "lucide-react";
import { type Session } from "next-auth";
import Link from "next/link";
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
    <DropdownMenuContent align="start">
      <DropdownMenuLabel>Organizations</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <div className="max-h-36 overflow-y-auto">
        {props.state === "loaded" ? (
          props.organizations
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
                <DropdownMenuItem className="p-0">
                  <Link
                    href={getOrgPath(dropdownOrg.id)}
                    className="flex min-w-0 flex-1 cursor-pointer px-2 py-1.5"
                  >
                    <span
                      className="max-w-36 overflow-hidden text-ellipsis whitespace-nowrap"
                      title={dropdownOrg.name}
                    >
                      {dropdownOrg.name}
                    </span>
                  </Link>
                  <Link
                    href={`/organization/${dropdownOrg.id}/settings`}
                    aria-label={`Go to settings for ${dropdownOrg.name}`}
                    className="hover:bg-background flex size-8 shrink-0 cursor-pointer items-center justify-center"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Settings size={12} />
                  </Link>
                </DropdownMenuItem>
              </Fragment>
            ))
        ) : (
          <DropdownMenuLoadingItem />
        )}
      </div>

      {canCreateOrganizations && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href={createOrganizationRoute}>
              <PlusIcon className="mr-1.5 h-4 w-4" aria-hidden="true" />
              New Organization
            </Link>
          </DropdownMenuItem>
        </>
      )}
    </DropdownMenuContent>
  );
}
