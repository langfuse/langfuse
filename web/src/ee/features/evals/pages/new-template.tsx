import Header from "@/src/components/layouts/header";
import { EvalTemplateForm } from "@/src/ee/features/evals/components/template-form";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { api } from "@/src/utils/api";

import { useRouter } from "next/router";

export default function NewTemplatesPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  const hasAccess = useHasAccess({ projectId, scope: "llmApiKeys:read" });

  if (!hasAccess) {
    return null;
  }

  const llmApiKeys = api.llmApiKey.all.useQuery({
    projectId: projectId,
  });

  return llmApiKeys.isLoading || !llmApiKeys.data ? (
    <div>Loading...</div>
  ) : (
    <div className="md:container">
      <Header title="Create eval template" />
      <EvalTemplateForm
        projectId={projectId}
        isEditing={true}
        apiKeys={llmApiKeys.data?.data ?? []}
      />
    </div>
  );
}
