import Page from "@/src/components/layouts/page";
import { useRouter } from "next/router";
import { Button } from "@/src/components/ui/button";
import Link from "next/link";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { Lock, Plus } from "lucide-react";
import EvalsTemplateTable from "@/src/ee/features/evals/components/eval-templates-table";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  TabsBar,
  TabsBarList,
  TabsBarTrigger,
} from "@/src/components/ui/tabs-bar";

export default function TemplatesPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const capture = usePostHogClientCapture();
  const hasWriteAccess = useHasProjectAccess({
    projectId,
    scope: "evalTemplate:create",
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
        title: "Evaluators",
        help: {
          description:
            "Create an evaluation template. Choose from one of the pre-defined templates or create your own.",
          href: "https://langfuse.com/docs/scores/model-based-evals",
        },
        tabsComponent: (
          <TabsBar value="templates">
            <TabsBarList>
              <TabsBarTrigger value="evaluators" asChild>
                <Link href={`/project/${projectId}/evals`}>Evaluators</Link>
              </TabsBarTrigger>
              <TabsBarTrigger value="templates">Templates</TabsBarTrigger>
              <TabsBarTrigger value="log" asChild>
                <Link href={`/project/${projectId}/evals/log`}>Log</Link>
              </TabsBarTrigger>
            </TabsBarList>
          </TabsBar>
        ),
        actionButtonsRight: (
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
              New Template
            </Link>
          </Button>
        ),
      }}
    >
      <EvalsTemplateTable projectId={projectId} />
    </Page>
  );
}
