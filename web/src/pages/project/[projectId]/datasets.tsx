import Header from "@/src/components/layouts/header";
import { useRouter } from "next/router";
import { DatasetsTable } from "@/src/features/datasets/components/DatasetsTable";
import { DatasetActionButton } from "@/src/features/datasets/components/DatasetActionButton";

export default function Traces() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  return (
    <div>
      <Header
        title="Datasets"
        help={{
          description:
            "Datasets in Langfuse are a collection of inputs (and expected outputs) of an LLM application. They are used to benchmark new releases before deployment to production. See docs to learn more.",
          href: "https://langfuse.com/docs/datasets",
        }}
        actionButtons={
          <DatasetActionButton projectId={projectId} mode="create" />
        }
      />
      <DatasetsTable projectId={projectId} />
    </div>
  );
}
