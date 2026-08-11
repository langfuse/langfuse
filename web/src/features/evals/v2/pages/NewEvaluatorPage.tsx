import { useRouter } from "next/router";
import { EvaluatorSetupPage } from "./EvaluatorSetupPage";

export default function NewEvaluatorPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  return <EvaluatorSetupPage projectId={projectId} initialEvaluator={null} />;
}
