import { useRouter } from "next/router";
import { useReadyRouteParams } from "@/src/hooks/useReadyRouteParams";
import { RouteParamsPendingFallback } from "@/src/components/RouteParamsPendingFallback/RouteParamsPendingFallback";
import { ErrorPage } from "@/src/components/error-page";
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

export default function AgentRoute() {
  const router = useRouter();
  const route = useReadyRouteParams(["projectId", "agentId"]);
  if (!route.ready || !router.isReady) return <RouteParamsPendingFallback />;
  const kind = router.query.identityKind;
  if (kind !== "id" && kind !== "name")
    return (
      <ErrorPage
        title="Agent identity is missing"
        message="Open this agent from the Agents gallery to preserve its identity type."
      />
    );
  return (
    <AgentDetailPage
      key={`${route.params.projectId}:${kind}:${route.params.agentId}`}
      projectId={route.params.projectId}
      identity={{ kind, value: route.params.agentId }}
    />
  );
}
