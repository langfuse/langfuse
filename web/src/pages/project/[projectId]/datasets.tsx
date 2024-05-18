import Header from "@/src/components/layouts/header";
import { useRouter } from "next/router";
import { DatasetsTable } from "@/src/features/datasets/components/DatasetsTable";
import { FullScreenPage } from "@/src/components/layouts/full-screen-page";

export default function Traces() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  return (
    <FullScreenPage>
      <Header
        title="Datasets"
        help={{
          description:
            "Datasets in Langfuse are a collection of inputs (and expected outputs) of an LLM application. They are used to benchmark new releases before deployment to production. See docs to learn more.",
          href: "https://langfuse.com/docs/datasets",
        }}
      />
      <DatasetsTable projectId={projectId} />
    </FullScreenPage>
  );
}
