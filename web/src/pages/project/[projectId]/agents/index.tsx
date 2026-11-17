import { useRouter } from "next/router";
import { useReadyRouteParams } from "@/src/hooks/useReadyRouteParams";
import { RouteParamsPendingFallback } from "@/src/components/RouteParamsPendingFallback/RouteParamsPendingFallback";
import { AgentsPage } from "@/src/features/agents/components/AgentsPage";
import { AgentDetailPage } from "@/src/features/agents/components/AgentDetailPage";
import { type GetServerSideProps } from "next";
import { normalizeAgentUrl } from "@/src/features/agents/server/agentRoute";

export const getServerSideProps: GetServerSideProps = async ({
  resolvedUrl,
}) => {
  const destination = normalizeAgentUrl(resolvedUrl);
  return destination
    ? { redirect: { destination, permanent: false } }
    : { props: {} };
};

export default function AgentsRoute() {
  const router = useRouter();
  const route = useReadyRouteParams(["projectId"]);
  if (!route.ready || !router.isReady) return <RouteParamsPendingFallback />;
  const value = router.query.agentId;
  const kind = router.query.identityKind;
  if (typeof value === "string" && (kind === "id" || kind === "name"))
    return (
      <AgentDetailPage
        key={`${kind}:${value}`}
        projectId={route.params.projectId}
        identity={{ kind, value }}
      />
    );
  return <AgentsPage projectId={route.params.projectId} />;
}
