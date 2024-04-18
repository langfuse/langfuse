import Header from "@/src/components/layouts/header";
import { EvalConfigForm } from "@/src/features/evals/components/eval-config-form";
import { api } from "@/src/utils/api";

import { useRouter } from "next/router";

export default function NewConfigsPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  const evalTemplates = api.evals.allTemplates.useQuery({
    projectId,
    limit: 500,
    page: 0,
  });

  return (
    <div>
      <Header title="Create eval config" />
      <EvalConfigForm
        projectId={projectId}
        evalTemplates={evalTemplates.data?.templates ?? []}
      />
    </div>
  );
}
