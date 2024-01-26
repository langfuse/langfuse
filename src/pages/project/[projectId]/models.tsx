import Header from "@/src/components/layouts/header";

import { useRouter } from "next/router";
import ModelTable from "@/src/components/table/use-cases/models";

export default function ModelsPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  return (
    <div>
      <Header
        title="Models"
        help={{
          description:
            "A model represents a LLM model. It is used to calculate tokens and cost.",
          href: "https://langfuse.com/docs/token-usage",
        }}
      />
      <ModelTable projectId={projectId} />
    </div>
  );
}
