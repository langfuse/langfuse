import { useRouter } from "next/router";
import ContainerPage from "@/src/components/layouts/ContainerPage";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import { useQueryOrganization } from "@/src/features/organizations/hooks";
import {
  resolveGatewayWorkspacePage,
  useGatewayWorkspacePages,
} from "@/src/features/ai-gateway/hooks/useGatewayWorkspacePages";

const FULL_HEIGHT_SLUGS = new Set(["setup", "models", "keys"]);

/** AI Gateway as its own area of the org: the sidebar lists its pages, this renders the open one. */
export function GatewayWorkspacePage() {
  const router = useRouter();
  const organization = useQueryOrganization();
  const pages = useGatewayWorkspacePages();
  const requestedSlug = Array.isArray(router.query.page)
    ? router.query.page[0]
    : undefined;
  const page = resolveGatewayWorkspacePage(pages, requestedSlug);

  if (!organization || !page) {
    return (
      <ContainerPage headerProps={{ title: "AI Gateway" }}>
        <NoDataOrLoading isLoading={!organization} />
      </ContainerPage>
    );
  }

  const fullHeight = FULL_HEIGHT_SLUGS.has(page.slug);

  return (
    <ContainerPage
      headerProps={{ title: page.title }}
      extendRight={fullHeight}
      fullHeight={fullHeight}
    >
      {page.content}
    </ContainerPage>
  );
}
