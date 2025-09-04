import { useRouter } from "next/router";
import ScoresTable from "@/src/components/table/use-cases/scores";
import Page from "@/src/components/layouts/page";
import { api } from "@/src/utils/api";
import { ScoresOnboarding } from "@/src/components/onboarding/ScoresOnboarding";

export default function ScoresPage() {
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
        title: "スコア",
        help: {
          description:
            "スコアはトレースや観察に対する評価値です。ユーザーフィードバック、モデルによる自動評価、または手動レビューから作成できます。詳細はドキュメントをご覧ください。",
          href: "https://langfuse.com/docs/scores",
        },
      }}
      scrollable={showOnboarding}
    >
      {/* Show onboarding screen if user has no scores */}
      {showOnboarding ? (
        <ScoresOnboarding />
      ) : (
        <ScoresTable projectId={projectId} />
      )}
    </Page>
  );
}
