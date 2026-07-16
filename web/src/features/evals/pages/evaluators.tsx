import Page from "@/src/components/layouts/page";
import { useRouter } from "next/router";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { Plus, Sparkles } from "lucide-react";
import EvaluatorTable from "@/src/features/evals/components/evaluator-table";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  getEvalsTabs,
  EVALS_TABS,
} from "@/src/features/navigation/utils/evals-tabs";
import { ActionButton } from "@/src/components/ActionButton";
import { api } from "@/src/utils/api";
import { useEntitlementLimit } from "@/src/features/entitlements/hooks";
import { SupportOrUpgradePage } from "@/src/ee/features/billing/components/SupportOrUpgradePage";
import { EvaluatorsOnboarding } from "@/src/components/onboarding/EvaluatorsOnboarding";
import { ManageDefaultEvalModel } from "@/src/features/evals/components/manage-default-eval-model";
import { EvaluatorGalleryDialog } from "@/src/features/evals/v2/components/EvaluatorGalleryDialog";

export default function EvaluatorsPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const capture = usePostHogClientCapture();

  // The v2 template gallery lives on this list page behind a query param
  // (deep-linkable); picking an entry deep-links into the standalone setup
  // page, which is decoupled from the gallery.
  const galleryOpen = router.query.gallery === "1";
  const setGalleryOpen = (open: boolean) => {
    const { gallery: _gallery, ...rest } = router.query;
    router
      .push(
        { query: open ? { ...router.query, gallery: "1" } : rest },
        undefined,
        { shallow: true },
      )
      .catch(() => undefined);
  };

  const evaluatorLimit = useEntitlementLimit(
    "model-based-evaluations-count-evaluators",
  );
  const hasWriteAccess = useHasProjectAccess({
    projectId,
    scope: "evalJob:CUD",
  });

  const hasReadAccess = useHasProjectAccess({
    projectId,
    scope: "evalJob:read",
  });

  // Fetch counts of evaluator configs and templates
  const countsQuery = api.evals.counts.useQuery(
    {
      projectId,
    },
    {
      enabled: !!projectId,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

  const showOnboarding =
    countsQuery.data?.configCount === 0 &&
    countsQuery.data?.templateCount === 0;

  if (!hasReadAccess) {
    return <SupportOrUpgradePage />;
  }

  if (showOnboarding) {
    return (
      <Page
        headerProps={{
          title: "Evaluators",
          help: {
            description:
              "Configure a langfuse managed or custom evaluator to evaluate incoming traces.",
            href: "https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge",
          },
        }}
        scrollable
      >
        <EvaluatorsOnboarding projectId={projectId} />
      </Page>
    );
  }

  return (
    <>
      <Page
        headerProps={{
          title: "Evaluators",
          help: {
            description:
              "Configure a langfuse managed or custom evaluator to evaluate incoming traces.",
            href: "https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge",
          },
          tabsProps: {
            tabs: getEvalsTabs(projectId),
            activeTab: EVALS_TABS.CONFIGS,
          },
          actionButtonsRight: (
            <>
              <ManageDefaultEvalModel projectId={projectId} />
              <ActionButton
                hasAccess={hasWriteAccess}
                icon={<Sparkles className="h-4 w-4" />}
                variant="outline"
                onClick={() => setGalleryOpen(true)}
                limitValue={countsQuery.data?.configActiveCount ?? 0}
                limit={evaluatorLimit}
              >
                New setup (beta)
              </ActionButton>
              <ActionButton
                hasAccess={hasWriteAccess}
                icon={<Plus className="h-4 w-4" />}
                variant="default"
                onClick={() => {
                  capture("eval_config:new_form_open");
                  router.push(`/project/${projectId}/evals/new`);
                }}
                limitValue={countsQuery.data?.configActiveCount ?? 0}
                limit={evaluatorLimit}
              >
                Set up evaluator
              </ActionButton>
            </>
          ),
        }}
      >
        <EvaluatorTable projectId={projectId} />
      </Page>
      <EvaluatorGalleryDialog
        projectId={projectId}
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        onSelectTemplate={(template) => {
          router
            .push(
              `/project/${projectId}/evals/v2/new?templateId=${encodeURIComponent(template.id)}`,
            )
            .catch(() => undefined);
        }}
        onCreateFromScratch={(type) => {
          router
            .push(`/project/${projectId}/evals/v2/new?scratch=${type}`)
            .catch(() => undefined);
        }}
      />
    </>
  );
}
