import { EvaluatorDetail } from "@/src/features/evals/components/evaluator-detail";
import EvaluatorsV2Page from "@/src/features/evals/v2/pages/evaluators";
import { useRouter } from "next/router";

export default function EvaluatorRoute() {
  const router = useRouter();

  // Next 16.2.11 dev routing currently resolves the static /evals/v2 route
  // through this sibling dynamic page. Keep the reserved segment functional
  // while preserving the legacy detail route for real evaluator IDs.
  return router.query.evaluatorId === "v2" ? (
    <EvaluatorsV2Page />
  ) : (
    <EvaluatorDetail />
  );
}
