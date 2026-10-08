import Page from "@/src/components/layouts/page";
import { InternalFeatureBadge } from "@/src/features/feature-flags";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { AgentsTable } from "./AgentsTable";

export default function AgentsPage() {
  const projectId = useProjectIdFromURL() ?? "";
  return (
    <Page
      headerProps={{
        title: "Agents",
        titleBadges: <InternalFeatureBadge />,
        help: {
          description:
            "Compare named agents across traces in the selected window. Runs are AGENT observations. Usage and cost belong to observations carrying the agent name, so child observations must carry it too.",
          href: "https://langfuse.com/docs/observability/sdk/instrumentation",
        },
      }}
    >
      <AgentsTable key={projectId} projectId={projectId} />
    </Page>
  );
}
