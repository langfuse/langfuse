import Header from "@/src/components/layouts/header";

import { useRouter } from "next/router";
import { NewModelForm } from "@/src/features/models/components/NewModelForm";
import { ScrollScreenPage } from "@/src/components/layouts/scroll-screen-page";

export default function ModelsPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  return (
    <ScrollScreenPage>
      <Header
        title="New Model Definition"
        breadcrumb={[
          {
            name: "Models",
            href: `/project/${projectId}/models`,
          },
          {
            name: "New",
          },
        ]}
        help={{
          description:
            "Create a project-specific model definition. This will be used by Langfuse to infer model usage (eg tokens) and cost (USD).",
          href: "https://langfuse.com/docs/model-usage-and-cost",
        }}
      />
      <NewModelForm
        projectId={projectId}
        onFormSuccess={() => void router.push(`/project/${projectId}/models`)}
      />
    </ScrollScreenPage>
  );
}
