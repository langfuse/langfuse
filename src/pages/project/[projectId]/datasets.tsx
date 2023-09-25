import Header from "@/src/components/layouts/header";
import { useRouter } from "next/router";
import { DatasetsTable } from "@/src/features/datasets/components/DatasetsTable";

export default function Traces() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  return (
    <div>
      <Header title="Datasets" />
      <DatasetsTable projectId={projectId} />
    </div>
  );
}
