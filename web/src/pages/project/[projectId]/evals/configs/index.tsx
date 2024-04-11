// NOTE: We may transition this feature from our MIT licensed repository to the
// a commercial License (ee folder) once we release a first stable version.
// Please consider this when planning long-term use and integration of this functionality into your projects.
// For more information see https://langfuse.com/docs/open-source

import Header from "@/src/components/layouts/header";
import { useRouter } from "next/router";
import { Button } from "@/src/components/ui/button";
import Link from "next/link";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { Lock } from "lucide-react";
import EvalConfigTable from "@/src/features/evals/components/eval-config-table";

export default function ConfigsPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

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
          <Button disabled={!hasWriteAccess} asChild>
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
