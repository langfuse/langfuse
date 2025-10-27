import { useRouter } from "next/router";
import Page from "@/src/components/layouts/page";
import {
  getScoresTabs,
  SCORES_TABS,
} from "@/src/features/navigation/utils/scores-tabs";

export default function ScoresAnalyticsPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  return (
    <Page
      headerProps={{
        title: "Scores",
        breadcrumb: [{ name: "Scores", href: `/project/${projectId}/scores` }],
        help: {
          description:
            "A scores is an evaluation of a traces or observations. It can be created from user feedback, model-based evaluations, or manual review. See docs to learn more.",
          href: "https://langfuse.com/docs/evaluation/overview",
        },
        tabsProps: {
          tabs: getScoresTabs(projectId),
          activeTab: SCORES_TABS.ANALYTICS,
        },
      }}
    >
      <div className="flex items-center justify-center p-8">
        <p className="text-muted-foreground">Score Analytics - Coming Soon</p>
      </div>
    </Page>
  );
}
