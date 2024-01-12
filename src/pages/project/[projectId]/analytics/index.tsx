import Header from "@/src/components/layouts/header";
import { NewChartButton } from "@/src/features/charts/NewChartButton";
import { useRouter } from "next/router";

export default function Analytics() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  // const charts = []; // trpc call

  return (
    <div>
      <Header title="Custom Charts" />
      <NewChartButton projectId={projectId} className="mt-4" />
    </div>
  );
}
