import { useRouter } from "next/router";
import { useEffect } from "react";

import Page from "@/src/components/layouts/Page";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import {
  GATEWAY_PAGE_SLUGS,
  type GatewayPageSlug,
} from "@/src/features/ai-gateway/constants/gatewayPageSlugs";
import { buildGatewayPagePath } from "@/src/features/ai-gateway/fns/gatewayUrls/buildGatewayPagePath";
import { useGatewayPages } from "@/src/features/ai-gateway/hooks/useGatewayPages";
import { useQueryOrganization } from "@/src/features/organizations/hooks";
import { cn } from "@/src/utils/tailwind";

const GATEWAY_TITLE = "AI Gateway";

/** An AI Gateway sub-page; the sidebar lists the sub-pages. */
export function GatewayPage() {
  const router = useRouter();
  const organization = useQueryOrganization();
  const pages = useGatewayPages();

  const requestedSlug =
    typeof router.query.page === "string"
      ? router.query.page
      : GATEWAY_PAGE_SLUGS.overview;

  const visiblePages = pages.filter((page) => page.show);
  const page =
    visiblePages.find((visiblePage) => visiblePage.slug === requestedSlug) ??
    visiblePages[0];

  const redirectPath = organization
    ? redirectPathFor(organization.id, requestedSlug, page?.slug)
    : undefined;
  useEffect(() => {
    if (redirectPath) router.replace(redirectPath);
  }, [redirectPath, router]);

  if (!organization || !page || redirectPath) {
    return (
      <Page withPadding headerProps={{ title: GATEWAY_TITLE }}>
        <NoDataOrLoading isLoading />
      </Page>
    );
  }

  return (
    <Page
      withPadding={!page.fullBleed && !page.scrollable}
      headerProps={{
        title: page.title,
        tabsProps: page.tabsProps,
        hideTitleRow: page.hideTitle,
        actionButtonsLeft: page.actionsLeft,
        actionButtonsRight: page.actions,
        help: page.help,
      }}
    >
      {page.scrollable ? (
        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto",
            !page.fullBleed && "p-3",
          )}
        >
          {page.content}
        </div>
      ) : (
        page.content
      )}
    </Page>
  );
}

/**
 * Keeps the URL and the active sidebar item on the page that is shown. Switching
 * to an organization without a gateway keeps the path, so that goes to its projects.
 */
function redirectPathFor(
  organizationId: string,
  requestedSlug: string,
  shownSlug: GatewayPageSlug | undefined,
): string | undefined {
  if (!shownSlug) return `/organization/${encodeURIComponent(organizationId)}`;
  if (shownSlug !== requestedSlug)
    return buildGatewayPagePath(organizationId, shownSlug);
  return undefined;
}
