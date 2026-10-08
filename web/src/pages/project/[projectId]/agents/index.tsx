import AgentsPage from "@/src/features/agents/AgentsPage";
import { AgentsFeatureGate } from "@/src/features/agents/AgentsFeatureGate";
import AgentDetailPage from "@/src/features/agents/AgentDetailPage";
import { useRouter } from "next/router";
import { RouteParamsPendingFallback } from "@/src/hooks/useReadyRouteParams";

export default function Agents() {
  const router = useRouter();
  if (!router.isReady) return <RouteParamsPendingFallback />;
  if (typeof router.query.agentName === "string") return <AgentDetailPage />;
  return (
    <AgentsFeatureGate>
      <AgentsPage />
    </AgentsFeatureGate>
  );
}
