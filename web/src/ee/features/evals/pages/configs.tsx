import Header from "@/src/components/layouts/header";
import { useRouter } from "next/router";
import { Button } from "@/src/components/ui/button";
import Link from "next/link";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { Lock } from "lucide-react";
import EvalConfigTable from "@/src/ee/features/evals/components/eval-config-table";
import { usePostHog } from "posthog-js/react";

export default function ConfigsPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const posthog = usePostHog();
  const hasWriteAccess = useHasAccess({
    projectId,
    scope: "job:CUD",
  });

  return (
    <div>
      <Header
        title="Eval configs"
        help={{
          description: "XXX",
          href: "https://langfuse.com/docs/evals",
        }}
        actionButtons={
          <Button
            disabled={!hasWriteAccess}
            onClick={() => posthog.capture("eval_config:new_form_open")}
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
    </div>
  );
}
