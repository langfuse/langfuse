import { type ReactNode } from "react";
import { isSettingsPageShown } from "@/src/components/PagedSettingsContainer";
import { useOrganizationSettingsPages } from "@/src/features/organizations/OrganizationSettingsPage";

const WORKSPACE_SLUGS = {
  "ai-gateway": "setup",
  "ai-gateway-models": "models",
  "ai-gateway-api-keys": "keys",
  "ai-gateway-analytics": "analytics",
} as const;

type WorkspaceSlug = (typeof WORKSPACE_SLUGS)[keyof typeof WORKSPACE_SLUGS];

export type GatewayWorkspacePage = {
  title: string;
  slug: WorkspaceSlug;
  content: ReactNode;
  indicator?: boolean;
};

const isSettingsSlug = (slug: string): slug is keyof typeof WORKSPACE_SLUGS =>
  slug in WORKSPACE_SLUGS;

export const gatewayWorkspacePath = (organizationId: string, slug?: string) =>
  `/organization/${organizationId}/ai-gateway${slug ? `/${slug}` : ""}`;

/** Gateway pages a user can open, in sidebar order; disabled pages are hidden until setup is done. */
export function useGatewayWorkspacePages(): GatewayWorkspacePage[] {
  const pages = useOrganizationSettingsPages();
  return pages.flatMap((page) => {
    if (page.section !== "AI Gateway" || !isSettingsSlug(page.slug)) return [];
    if (!isSettingsPageShown(page) || page.disabledReason) return [];
    if (!("content" in page)) return [];
    return [
      {
        title: page.title,
        slug: WORKSPACE_SLUGS[page.slug],
        content: page.content,
        indicator: page.indicator,
      },
    ];
  });
}

/** Opens Analytics once the gateway is set up, otherwise the first page (Setup). */
export function resolveGatewayWorkspacePage(
  pages: GatewayWorkspacePage[],
  requestedSlug: string | undefined,
): GatewayWorkspacePage | undefined {
  return (
    pages.find((page) => page.slug === requestedSlug) ??
    pages.find((page) => page.slug === "analytics") ??
    pages[0]
  );
}
