import Link from "next/link";

import ContainerPage from "@/src/components/layouts/ContainerPage";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";
import { useAiGatewayPages } from "@/src/features/ai-gateway/hooks/useAiGatewayPages";
import {
  aiGatewayPath,
  type AiGatewayPageSlug,
} from "@/src/features/ai-gateway/fns/gatewayUrls/aiGatewayPath";

/** Falls back to the first page the member can see, e.g. Keys for gateway-only members. */
export function AiGatewayPage({ slug }: { slug: AiGatewayPageSlug }) {
  const { organization } = useQueryProjectOrOrganization();
  const visiblePages = useAiGatewayPages(organization ?? undefined).filter(
    (page) => page.show,
  );
  const activePage =
    visiblePages.find((page) => page.slug === slug) ?? visiblePages[0];

  if (!organization) {
    return (
      <ContainerPage headerProps={{ title: "AI Gateway" }}>
        <NoDataOrLoading isLoading />
      </ContainerPage>
    );
  }

  if (!activePage) {
    return (
      <ContainerPage headerProps={{ title: "AI Gateway" }}>
        <NoDataOrLoading
          isLoading={false}
          description="You do not have access to the AI Gateway in this organization."
        />
      </ContainerPage>
    );
  }

  return (
    <ContainerPage
      headerProps={{
        title: activePage.title,
        breadcrumb: [
          { name: "AI Gateway", href: aiGatewayPath(organization.id) },
        ],
        breadcrumbBadges: (
          <Badge text="Beta" color="blue" size="sm" font="mono" />
        ),
      }}
      fullHeight={activePage.fullHeight}
      extendRight={activePage.fullHeight}
    >
      {activePage.disabledReason ? (
        <p className="text-muted-foreground text-sm">
          {activePage.disabledReason}{" "}
          <Link className="underline" href={aiGatewayPath(organization.id)}>
            Open setup
          </Link>
        </p>
      ) : (
        activePage.content
      )}
    </ContainerPage>
  );
}
