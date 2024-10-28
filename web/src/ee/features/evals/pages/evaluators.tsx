import Header from "@/src/components/layouts/header";
import { useRouter } from "next/router";
import { Button } from "@/src/components/ui/button";
import Link from "next/link";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { Lock, Plus } from "lucide-react";
import EvaluatorTable from "@/src/ee/features/evals/components/evaluator-table";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { FullScreenPage } from "@/src/components/layouts/full-screen-page";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";

export default function EvaluatorsPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const capture = usePostHogClientCapture();
  const hasWriteAccess = useHasProjectAccess({
    projectId,
    scope: "evalJob:CUD",
  });

  const hasReadAccess = useHasProjectAccess({
    projectId,
    scope: "evalJob:read",
  });

  if (!hasReadAccess) {
    return null;
  }

  return (
    <FullScreenPage>
      <Header
        title="Evaluators"
        help={{
          description:
            "Use LLM-as-a-judge evaluators as practical addition to human annotation. Configure an evaluation prompt and a model as judge to evaluate incoming traces.",
          href: "https://langfuse.com/docs/scores/model-based-evals",
        }}
        actionButtons={
          <Button
            disabled={!hasWriteAccess}
            onClick={() => capture("eval_config:new_form_open")}
            asChild
            variant="secondary"
          >
            <Link
              href={hasWriteAccess ? `/project/${projectId}/evals/new` : "#"}
            >
              {hasWriteAccess ? (
                <Plus className="mr-2 h-4 w-4" />
              ) : (
                <Lock className="mr-2 h-4 w-4" />
              )}
              New evaluator
            </Link>
          </Button>
        }
      />
      <EvaluatorTable
        projectId={projectId}
        menuItems={
          <Tabs value="evaluators">
            <TabsList>
              <TabsTrigger value="evaluators">Evaluators</TabsTrigger>
              <TabsTrigger value="templates" asChild>
                <Link href={`/project/${projectId}/evals/templates`}>
                  Templates
                </Link>
              </TabsTrigger>
              <TabsTrigger value="log" asChild>
                <Link href={`/project/${projectId}/evals/log`}>Log</Link>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />
    </FullScreenPage>
  );
}
