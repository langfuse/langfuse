import { useRouter } from "next/router";
import { DatasetsTable } from "@/src/features/datasets/components/DatasetsTable";
import PageContainer from "@/src/components/layouts/page-container";

export default function Traces() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  return (
    <PageContainer
      headerProps={{
        title: "Datasets",
        help: {
          description:
            "Datasets in Langfuse are a collection of inputs (and expected outputs) of an LLM application. They are used to benchmark new releases before deployment to production. See docs to learn more.",
          href: "https://langfuse.com/docs/datasets",
        },
      }}
    >
      <DatasetsTable projectId={projectId} />
    </PageContainer>
  );
}
