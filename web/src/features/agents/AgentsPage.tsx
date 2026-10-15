import Page from "@/src/components/layouts/page";
import { InternalFeatureBadge } from "@/src/features/feature-flags";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { AgentsOverview } from "./overview/AgentsOverview";

export default function AgentsPage() {
  const projectId = useProjectIdFromURL() ?? "";
  return (
    <Page
      headerProps={{
        title: "Agents",
        titleBadges: <InternalFeatureBadge />,
        help: {
          description:
            "Discover agents, compare session activity, and inspect changes across a bounded observation sample. Identity, session, and tool evidence remain separate.",
          href: "https://langfuse.com/docs/observability/sdk/instrumentation",
        },
      }}
    >
      <AgentsOverview key={projectId} projectId={projectId} />
    </Page>
  );
}
