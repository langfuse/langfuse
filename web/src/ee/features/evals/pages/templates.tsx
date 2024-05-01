import Header from "@/src/components/layouts/header";
import { useRouter } from "next/router";
import { Button } from "@/src/components/ui/button";
import Link from "next/link";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { Lock } from "lucide-react";
import EvalsTemplateTable from "@/src/ee/features/evals/components/eval-templates-table";

export default function TemplatesPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  const hasWriteAccess = useHasAccess({
    projectId,
    scope: "evalTemplate:create",
  });

  return (
    <div>
      <Header
        title="Eval Templates"
        help={{
          description: "XXX",
          href: "https://langfuse.com/docs/evals",
        }}
        actionButtons={
          <Button disabled={!hasWriteAccess} asChild>
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
