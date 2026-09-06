import { useRouter } from "next/router";
import ScoresTable from "@/src/components/table/use-cases/scores";
import Page from "@/src/components/layouts/page";
import { api } from "@/src/utils/api";
import { ScoresOnboarding } from "@/src/components/onboarding/ScoresOnboarding";
import {
  getScoresTabs,
  SCORES_TABS,
} from "@/src/features/navigation/utils/scores-tabs";
import { useTranslations } from "next-intl";

export default function ScoresPage() {
  const t = useTranslations("systemUi.miscUi.pages");
  const router = useRouter();
  const projectId = router.query.projectId as string;

  // Check if the user has any scores
  const { data: hasAnyScore, isLoading } = api.scores.hasAny.useQuery(
    { projectId },
    {
      enabled: !!projectId,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      refetchInterval: 10_000,
    },
  );

  const showOnboarding = !isLoading && !hasAnyScore;

  return (
    <Page
      headerProps={{
        title: t("scores"),
        help: {
          description: t("scoresDescription"),
          href: "https://langfuse.com/docs/evaluation/overview",
        },
        tabsProps: {
          tabs: getScoresTabs(projectId),
          activeTab: SCORES_TABS.SCORES,
        },
      }}
      scrollable={showOnboarding}
    >
      {/* Show onboarding screen if user has no scores */}
      {showOnboarding ? (
        <ScoresOnboarding />
      ) : (
        <ScoresTable
          projectId={projectId}
          showControlsInPageHeader
          showAllEnvironments={router.query.showAllEnvironments === "true"}
        />
      )}
    </Page>
  );
}
