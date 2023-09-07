import Header from "@/src/components/layouts/header";
import { useRouter } from "next/router";
import TracesTable from "@/src/components/table/use-cases/traces";

export default function Traces() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  return (
    <div>
      <Header title="Traces" />
      <TracesTable projectId={projectId} />
    </div>
  );
}
