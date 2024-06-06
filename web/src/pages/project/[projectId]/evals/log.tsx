// NOTE: We may transition this feature from our MIT licensed repository to the
// a commercial License (ee folder) once we release a first stable version.
// Please consider this when planning long-term use and integration of this functionality into your projects.
// For more information see https://langfuse.com/docs/open-source

import Header from "@/src/components/layouts/header";
import { useRouter } from "next/router";
import EvalLogTable from "@/src/ee/features/evals/components/eval-log";

export default function TemplatesPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  return (
    <div className="h-[calc(100vh-6rem)] overflow-hidden lg:h-[calc(100vh-2rem)]">
      <Header
        title="Eval Log"
        help={{
          description: "View of all running evals.",
          href: "https://langfuse.com/docs/scores/model-based-evals",
        }}
      />
      <EvalLogTable projectId={projectId} />
    </div>
  );
}
