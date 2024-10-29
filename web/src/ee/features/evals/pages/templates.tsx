import Header from "@/src/components/layouts/header";
import { useRouter } from "next/router";
import { Button } from "@/src/components/ui/button";
import Link from "next/link";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { Lock, Plus } from "lucide-react";
import EvalsTemplateTable from "@/src/ee/features/evals/components/eval-templates-table";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";

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
    <div className="flex h-[calc(100vh-6rem)] flex-col overflow-hidden md:h-[calc(100vh-2rem)]">
      <Header
        title="Eval Templates"
        help={{
          description:
            "Create an evaluation template. Choose from one of the pre-defined templates or create your own.",
          href: "https://langfuse.com/docs/scores/model-based-evals",
        }}
        actionButtons={
          <Button
            disabled={!hasWriteAccess}
            onClick={() => capture("eval_templates:new_form_open")}
            asChild
            variant="secondary"
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
              New template
            </Link>
          </Button>
        }
      />
      <EvalsTemplateTable
        projectId={projectId}
        menuItems={
          <Tabs value="templates">
            <TabsList>
              <TabsTrigger value="evaluators" asChild>
                <Link href={`/project/${projectId}/evals`}>Evaluators</Link>
              </TabsTrigger>
              <TabsTrigger value="templates">Templates</TabsTrigger>
              <TabsTrigger value="log" asChild>
                <Link href={`/project/${projectId}/evals/log`}>Log</Link>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />
    </div>
  );
}
