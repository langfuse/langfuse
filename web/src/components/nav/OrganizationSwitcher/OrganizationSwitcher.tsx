import { type ComponentProps } from "react";

import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { LangfuseIcon } from "@/src/components/design-system/LangfuseIcon/LangfuseIcon";
import { OrganizationDropdownMenu } from "@/src/components/OrganizationDropdownMenu/OrganizationDropdownMenu";
import { cn } from "@/src/utils/tailwind";

type OrganizationOption = Extract<
  ComponentProps<typeof OrganizationDropdownMenu>,
  { state: "loaded" }
>["organizations"][number];

type OrganizationSwitcherProps = {
  organization: { id: string; name: string } | null;
  organizations: OrganizationOption[] | null;
  canCreateOrganizations: boolean;
  /** Self-hosted custom logo; replaces the Langfuse icon. */
  logo: {
    lightModeHref?: string;
    darkModeHref?: string;
  };
};

/** Sidebar header: brand mark plus the current organization, which opens the organization menu. */
export function OrganizationSwitcher({
  organization,
  organizations,
  canCreateOrganizations,
  logo,
}: OrganizationSwitcherProps) {
  const name = organization?.name ?? "Select organization";

  return (
    <OrganizationDropdownMenu
      {...(organizations
        ? { state: "loaded", organizations }
        : { state: "loading" })}
      canCreateOrganizations={canCreateOrganizations}
      getOrgPath={organizationOverviewPath}
    >
      {({ getTriggerProps }) => (
        <button
          type="button"
          {...getTriggerProps({
            "aria-label": `Switch organization, current: ${name}`,
            className: cn(
              "hover:bg-sidebar-accent focus-visible:ring-ring flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-sm font-bold outline-hidden focus-visible:ring-2",
              "group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:flex-none group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0",
            ),
          })}
        >
          <BrandMark logo={logo} />
          <span
            className="ph-no-capture min-w-0 flex-1 truncate group-data-[collapsible=icon]:hidden"
            title={name}
          >
            {name}
          </span>
          <span className="flex shrink-0 group-data-[collapsible=icon]:hidden">
            <DropdownIndicator direction="up-down" size="sm" />
          </span>
        </button>
      )}
    </OrganizationDropdownMenu>
  );
}

function BrandMark({ logo }: Pick<OrganizationSwitcherProps, "logo">) {
  if (logo.lightModeHref && logo.darkModeHref) {
    // Custom logos may be up to 3:1 wide, per the UI customization docs, so
    // the collapsed sidebar falls back to the Langfuse icon.
    return (
      <>
        <span className="flex shrink-0 items-center group-data-[collapsible=icon]:hidden">
          <img
            src={logo.lightModeHref}
            alt=""
            className="max-h-5 max-w-14 dark:hidden"
          />
          <img
            src={logo.darkModeHref}
            alt=""
            className="hidden max-h-5 max-w-14 dark:block"
          />
        </span>
        <span className="hidden group-data-[collapsible=icon]:flex">
          <LangfuseIcon size={16} />
        </span>
      </>
    );
  }
  return <LangfuseIcon size={16} />;
}

function organizationOverviewPath(organizationId: string) {
  return `/organization/${organizationId}`;
}
