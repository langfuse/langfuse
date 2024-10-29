// NOTE: We may transition this feature from our MIT licensed repository to the
// a commercial License (ee folder) once we release a first stable version.
// Please consider this when planning long-term use and integration of this functionality into your projects.
// For more information see https://langfuse.com/docs/open-source

import Header from "@/src/components/layouts/header";
import { useRouter } from "next/router";
import EvalLogTable from "@/src/ee/features/evals/components/eval-log";
import { FullScreenPage } from "@/src/components/layouts/full-screen-page";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import Link from "next/link";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";

export default function LogPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  const hasReadAccess = useHasProjectAccess({
    projectId,
    scope: "evalJobExecution:read",
  });

  if (!hasReadAccess) {
    return null;
  }

  return (
    <FullScreenPage>
      <Header
        title="Eval Log"
        help={{
          description: "View of all running evals.",
          href: "https://langfuse.com/docs/scores/model-based-evals",
        }}
      />
      <EvalLogTable
        projectId={projectId}
        menuItems={
          <Tabs value="log">
            <TabsList>
              <TabsTrigger value="evaluators" asChild>
                <Link href={`/project/${projectId}/evals`}>Evaluators</Link>
              </TabsTrigger>
              <TabsTrigger value="templates" asChild>
                <Link href={`/project/${projectId}/evals/templates`}>
                  Templates
                </Link>
              </TabsTrigger>
              <TabsTrigger value="log">Log</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />
    </FullScreenPage>
  );
}
