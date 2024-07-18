import Header from "@/src/components/layouts/header";
import { useRouter } from "next/router";
import { Button } from "@/src/components/ui/button";
import Link from "next/link";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { Lock } from "lucide-react";
import EvalConfigTable from "@/src/ee/features/evals/components/eval-config-table";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { FullScreenPage } from "@/src/components/layouts/full-screen-page";

export default function ConfigsPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const capture = usePostHogClientCapture();
  const hasWriteAccess = useHasAccess({
    projectId,
    scope: "evalJob:CUD",
  });

  return (
    <FullScreenPage>
      <Header
        title="Eval configs"
        help={{
          description:
            "Eval configs let you define how your evaluations templates are applied to incoming traces in Langfuse.",
          href: "https://langfuse.com/docs/scores/model-based-evals",
        }}
        actionButtons={
          <Button
            disabled={!hasWriteAccess}
            onClick={() => capture("eval_config:new_form_open")}
            asChild
          >
            <Link
              href={
                hasWriteAccess ? `/project/${projectId}/evals/configs/new` : "#"
              }
            >
              {!hasWriteAccess && <Lock size={16} className="mr-2" />}
              Add eval config
            </Link>
          </Button>
        }
      />
      <EvalConfigTable projectId={projectId} />
    </FullScreenPage>
  );
}
