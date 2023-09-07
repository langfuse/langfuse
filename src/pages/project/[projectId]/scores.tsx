import Header from "@/src/components/layouts/header";

import { useRouter } from "next/router";
import ScoresTable from "@/src/components/table/use-cases/scores";

export default function ScoresPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  return (
    <div>
      <Header title="Scores" />
      <ScoresTable projectId={projectId} />
    </div>
  );
}
