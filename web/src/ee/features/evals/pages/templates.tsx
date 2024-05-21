import Header from "@/src/components/layouts/header";
import { useRouter } from "next/router";
import { Button } from "@/src/components/ui/button";
import Link from "next/link";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { Lock } from "lucide-react";
import EvalsTemplateTable from "@/src/ee/features/evals/components/eval-templates-table";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

export default function TemplatesPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const capture = usePostHogClientCapture();
  const hasWriteAccess = useHasAccess({
    projectId,
    scope: "evalTemplate:create",
  });

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
          >
            <Link
              href={
                hasWriteAccess
                  ? `/project/${projectId}/evals/templates/new`
                  : "#"
              }
            >
              {!hasWriteAccess && <Lock size={16} className="mr-2" />}
              Add eval template
            </Link>
          </Button>
        }
      />
      <EvalsTemplateTable projectId={projectId} />
    </div>
  );
}
