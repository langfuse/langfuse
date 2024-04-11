import * as React from "react";
import Header from "@/src/components/layouts/header";
import { api } from "@/src/utils/api";
import { useRouter } from "next/router";
import { EvalConfigForm } from "@/src/features/evals/components/eval-config-form";

export const EvalConfigDetail = () => {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const configId = router.query.configId as string;

  // get the current template by id
  const config = api.evals.configById.useQuery({
    projectId: projectId,
    id: configId,
  });

  // get all templates for the current template name
  const allTemplates = api.evals.allTemplatesForName.useQuery(
    {
      projectId: projectId,
      name: config.data?.evalTemplate?.name ?? "",
    },
    {
      enabled: !config.isLoading && !config.isError,
    },
  );

  if (
    config.isLoading ||
    !config.data ||
    allTemplates.isLoading ||
    !allTemplates.data
  ) {
    return <div>Loading...</div>;
  }

  if (config.data && config.data.evalTemplate === null) {
    return <div>Config not found</div>;
  }

  console.log(config.data);

  return (
    <div className="md:container">
      <Header
        title={config.data?.id ?? "Loading..."}
        help={{
          description:
            "A scores is an evaluation of a traces or observations. It can be created from user feedback, model-based evaluations, or manual review. See docs to learn more.",
          href: "https://langfuse.com/docs/scores",
        }}
      />
      <EvalConfigForm
        projectId={projectId}
        evalTemplates={allTemplates.data?.templates}
        existingEvalConfig={
          config.data && config.data.evalTemplate
            ? { ...config.data, evalTemplate: config.data.evalTemplate }
            : undefined
        }
        disabled={true}
      />
    </div>
  );
};
