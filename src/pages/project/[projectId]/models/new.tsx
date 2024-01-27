import Header from "@/src/components/layouts/header";

import { useRouter } from "next/router";
import { NewModelForm } from "@/src/features/models/components/NewModelForm";

export default function ModelsPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  return (
    <div className="mb-12 md:container">
      <Header
        title="New Model"
        breadcrumb={[
          {
            name: "Models",
            href: `/project/${projectId}/models`,
          },
          {
            name: "New",
          },
        ]}
      />
      <NewModelForm
        projectId={projectId}
        onFormSuccess={() => void router.push(`/project/${projectId}/models`)}
      />
    </div>
  );
}
