// CIP fork feature (see FORK.md): Elicitations — participatory sessions that
// source evaluation criteria and rubric weights from human participants.
// Splash screen when the project has none; otherwise the index table.
import Page from "@/src/components/layouts/page";
import { SplashScreen } from "@/src/components/ui/splash-screen";
import { SupportOrUpgradePage } from "@/src/ee/features/billing/components/SupportOrUpgradePage";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";
import { useRouter } from "next/router";
import { ElicitationsTable } from "../components/ElicitationsTable";
import { NewElicitationButton } from "../components/NewElicitationButton";

export default function Elicitations() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "elicitations:read",
  });
  const hasCudAccess = useHasProjectAccess({
    projectId,
    scope: "elicitations:CUD",
  });

  const utils = api.useUtils();
  const create = api.elicitations.create.useMutation({
    onSuccess: async ({ id }) => {
      await utils.elicitations.invalidate();
      await router.push(`/project/${projectId}/elicitations/${id}`);
    },
  });

  const { data: hasAny, isLoading } = api.elicitations.hasAny.useQuery(
    { projectId },
    { enabled: !!projectId && hasAccess },
  );

  if (!hasAccess) return <SupportOrUpgradePage />;

  const showSplash = !isLoading && !hasAny;

  return (
    <Page
      headerProps={{
        title: "Elicitations",
        help: {
          description:
            "Elicitations are structured sessions that gather judgments, criteria, and reflections from human participants. They are used to source evaluation criteria and rubric weights directly from affected communities before they're encoded into blueprints.",
        },
        actionButtonsRight: !showSplash ? (
          <NewElicitationButton projectId={projectId} />
        ) : undefined,
      }}
      scrollable={showSplash}
    >
      {showSplash ? (
        <SplashScreen
          title="Get started with Elicitations"
          description="Design elicitation sessions to gather structured judgments from participants. Turn community input into evaluation criteria and export them directly into Weval blueprints."
          primaryAction={{
            label: "New elicitation",
            onClick:
              hasCudAccess && !create.isPending
                ? () => create.mutate({ projectId })
                : undefined,
          }}
          secondaryAction={{
            label: "Learn More",
          }}
        />
      ) : (
        <ElicitationsTable projectId={projectId} />
      )}
    </Page>
  );
}
