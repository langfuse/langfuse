import Page from "@/src/components/layouts/page";
import { useRouter } from "next/router";
import { Button } from "@/src/components/ui/button";
import Link from "next/link";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { Lock, Plus } from "lucide-react";
import EvalsTemplateTable from "@/src/features/evals/components/eval-templates-table";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  TabsBar,
  TabsBarList,
  TabsBarTrigger,
} from "@/src/components/ui/tabs-bar";
import { ManageDefaultEvalModel } from "@/src/features/evals/components/manage-default-eval-model";

export default function TemplatesPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const capture = usePostHogClientCapture();
  const hasWriteAccess = useHasProjectAccess({
    projectId,
    scope: "evalTemplate:CUD",
  });

  const hasReadAccess = useHasProjectAccess({
    projectId,
    scope: "evalTemplate:read",
  });

  if (!hasReadAccess) {
    return null;
  }

  return (
    <Page
      headerProps={{
        title: "LLM-as-a-Judge Evaluators",
        help: {
          description: "View all langfuse managed and custom evaluators.",
          href: "https://langfuse.com/docs/scores/model-based-evals",
        },
        tabsComponent: (
          <TabsBar value="templates">
            <TabsBarList>
              <TabsBarTrigger value="configs" asChild>
                <Link href={`/project/${projectId}/evals`}>
                  Running Evaluators
                </Link>
              </TabsBarTrigger>
              <TabsBarTrigger value="templates">
                Evaluator Library
              </TabsBarTrigger>
            </TabsBarList>
          </TabsBar>
        ),
        actionButtonsRight: (
          <>
            <ManageDefaultEvalModel projectId={projectId} />
            <Button
              disabled={!hasWriteAccess}
              onClick={() => capture("eval_templates:new_form_open")}
              asChild
              variant="default"
            >
              <Link
                href={
                  hasWriteAccess
                    ? `/project/${projectId}/evals/templates/new`
                    : "#"
                }
              >
                {hasWriteAccess ? (
                  <Plus className="mr-2 h-4 w-4" />
                ) : (
                  <Lock className="mr-2 h-4 w-4" />
                )}
                Custom Evaluator
              </Link>
            </Button>
          </>
        ),
      }}
    >
      <EvalsTemplateTable projectId={projectId} />
    </Page>
  );
}
