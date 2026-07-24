import { useRouter } from "next/router";

import Page from "@/src/components/layouts/page";
import { EvaluatorCreateButton } from "@/src/features/evals/v2/components/EvaluatorCreateButton";
import { EvaluatorGalleryDialog } from "@/src/features/evals/v2/components/EvaluatorGalleryDialog";
import { EvaluatorOverviewTable } from "@/src/features/evals/v2/components/EvaluatorOverviewTable";
import {
  EVALS_V2_TABS,
  getEvalsV2Tabs,
} from "@/src/features/navigation/utils/evals-v2-tabs";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { SupportOrUpgradePage } from "@/src/ee/features/billing/components/SupportOrUpgradePage";

export default function EvaluatorsV2Page() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const capture = usePostHogClientCapture();
  const galleryOpen = router.query.gallery === "1";
  const hasReadAccess = useHasProjectAccess({
    projectId,
    scope: "evalJob:read",
  });
  const hasWriteAccess = useHasProjectAccess({
    projectId,
    scope: "evalJob:CUD",
  });

  if (!hasReadAccess) return <SupportOrUpgradePage />;

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

  return (
    <>
      <Page
        headerProps={{
          title: "Evaluators v2",
          help: {
            description:
              "Create reusable evaluator definitions and attach them to one or more evaluation rules.",
          },
          tabsProps: {
            tabs: getEvalsV2Tabs(projectId),
            activeTab: EVALS_V2_TABS.EVALUATORS,
            actionButtonsRight: (
              <EvaluatorCreateButton
                hasWriteAccess={hasWriteAccess}
                onStartFromTemplate={() => {
                  capture("eval_config:creation_path_selected", {
                    source: "template",
                  });
                  setGalleryOpen(true);
                }}
              />
            ),
          },
        }}
      >
        <EvaluatorOverviewTable
          projectId={projectId}
          hasWriteAccess={hasWriteAccess}
        />
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
          capture("eval_config:creation_path_selected", {
            source: "scratch",
            evaluatorType: type,
          });
          router
            .push(`/project/${projectId}/evals/v2/new?scratch=${type}`)
            .catch(() => undefined);
        }}
      />
    </>
  );
}
