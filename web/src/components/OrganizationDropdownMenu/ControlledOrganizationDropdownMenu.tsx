import { ControlledDropdownMenu } from "@/src/components/design-system/ControlledDropdownMenu/ControlledDropdownMenu";
import { Building, PlusIcon, Settings } from "@langfuse/icons";
import { type Session } from "next-auth";
import { type ComponentProps, useMemo } from "react";
import { env } from "@/src/env.mjs";
import { createOrganizationRoute } from "@/src/features/setup/setupRoutes";
import { isCloudPlan, planLabels } from "@langfuse/shared";

type Organization = NonNullable<Session["user"]>["organizations"][number];

export type OrganizationMenuOptions = {
  children: ComponentProps<typeof ControlledDropdownMenu>["children"];
  canCreateOrganizations: boolean;
  getOrgPath: (organizationId: string) => string;
  /** Ticked in the list; its settings get a link under the list. */
  currentOrganizationId?: string;
} & (
  | { state: "loading" }
  | {
      state: "loaded";
      organizations: Organization[];
    }
);

export function ControlledOrganizationDropdownMenu(
  props: OrganizationMenuOptions &
    Pick<
      ComponentProps<typeof ControlledDropdownMenu>,
      "open" | "onOpenChange"
    >,
) {
  const {
    canCreateOrganizations,
    children,
    getOrgPath,
    currentOrganizationId,
  } = props;
  const organizations = props.state === "loaded" ? props.organizations : null;

  const items = useMemo<ComponentProps<typeof ControlledDropdownMenu>["items"]>(
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
                type: "entity" as const,
                id: organization.id,
                noCapture: true,
                title: organization.name,
                icon: Building,
                description:
                  isCloudPlan(organization.plan) &&
                  env.NEXT_PUBLIC_DEMO_ORG_ID !== organization.id
                    ? `${planLabels[organization.plan]} plan`
                    : undefined,
                selected: organization.id === currentOrganizationId,
                href: getOrgPath(organization.id),
              },
            ])
        : [{ type: "loading" as const, id: "loading" }]),
    ],
    [currentOrganizationId, getOrgPath, organizations],
  );

  const footerItems = useMemo<
    ComponentProps<typeof ControlledDropdownMenu>["items"]
  >(
    () => [
      ...(currentOrganizationId
        ? [
            {
              type: "item" as const,
              id: "organization-settings",
              title: "Organization settings",
              icon: Settings,
              href: `/organization/${currentOrganizationId}/settings`,
            },
          ]
        : []),
      ...(canCreateOrganizations
        ? [
            {
              type: "item" as const,
              id: "new-organization",
              title: "New organization",
              icon: PlusIcon,
              href: createOrganizationRoute,
            },
          ]
        : []),
    ],
    [canCreateOrganizations, currentOrganizationId],
  );

  const menuProps: ComponentProps<typeof ControlledDropdownMenu> = {
    open: props.open,
    onOpenChange: props.onOpenChange,
    ariaLabel: "Organizations",
    items,
    footerItems,
    width: "wide",
    // Caps the list; settings and New stay pinned below it.
    maxHeight: "min(28rem, calc(100dvh - 4rem))",
    search: { placeholder: "Search organizations..." },
    emptyText: "No organization found.",
    children,
  };

  return <ControlledDropdownMenu {...menuProps} />;
}
