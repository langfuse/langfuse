import Header from "@/src/components/layouts/header";
import { useRouter } from "next/router";
import GenerationsTable from "@/src/components/table/use-cases/generations";

export default function Generations() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  return (
    <div>
      <Header title="Generations" />
      <GenerationsTable projectId={projectId} />
    </div>
  );
}
