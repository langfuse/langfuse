import Spinner from "@/src/components/design-system/Spinner/Spinner";
import { Button } from "@/src/components/ui/button";
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
  onGoToOrganizationSettings: (organizationId: string) => void;
} & (
  | { state: "loading" }
  | {
      state: "loaded";
      organizations: Organization[];
    }
);

// TODO: This is duplicated in /web/src/components/layouts/breadcrumb.tsx
// Should this be a shared utility component?
const LoadingMenuItem = () => (
  <DropdownMenuItem>
    <span className="mr-1.5 inline-flex">
      <Spinner size="sm" />
    </span>
    Loading...
  </DropdownMenuItem>
);

export function OrganizationDropdownMenu(props: OrganizationDropdownMenuProps) {
  const { canCreateOrganizations, getOrgPath, onGoToOrganizationSettings } =
    props;

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
                <DropdownMenuItem asChild>
                  <Link
                    href={getOrgPath(dropdownOrg.id)}
                    className="flex cursor-pointer justify-between"
                  >
                    <span
                      className="max-w-36 overflow-hidden text-ellipsis whitespace-nowrap"
                      title={dropdownOrg.name}
                    >
                      {dropdownOrg.name}
                    </span>
                    <Button
                      asChild
                      variant="ghost"
                      size="xs"
                      className="hover:bg-background -my-1 ml-4"
                    >
                      <div
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onGoToOrganizationSettings(dropdownOrg.id);
                        }}
                      >
                        <Settings size={12} />
                      </div>
                    </Button>
                  </Link>
                </DropdownMenuItem>
              </Fragment>
            ))
        ) : (
          <LoadingMenuItem />
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
