import Page from "@/src/components/layouts/page";
import { EvaluatorSetupLoadingState } from "./EvaluatorSetupLoadingState";

export function EvaluatorSetupLoadingPage({
  mode,
  projectId,
}: {
  mode: "create" | "edit";
  projectId?: string;
}) {
  return (
    <Page
      headerProps={{
        title: mode === "create" ? "New evaluator" : "Configure evaluator",
        breadcrumb: projectId
          ? [{ name: "Evaluators", href: `/project/${projectId}/evals` }]
          : undefined,
      }}
    >
      <EvaluatorSetupLoadingState mode={mode} />
    </Page>
  );
}
