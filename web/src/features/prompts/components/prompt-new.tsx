import { StringParam, useQueryParam } from "use-query-params";

import Header from "@/src/components/layouts/header";
import { NewPromptForm } from "@/src/features/prompts/components/NewPromptForm";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { api } from "@/src/utils/api";

export const NewPrompt = () => {
  const projectId = useProjectIdFromURL();
  const [initialPromptId] = useQueryParam("promptId", StringParam);

  const { data: initialPrompt, isInitialLoading } = api.prompts.byId.useQuery(
    {
      projectId: projectId as string, // Typecast as query is enabled only when projectId is present
      id: initialPromptId ?? "",
    },
    { enabled: Boolean(initialPromptId && projectId) },
  );

  if (isInitialLoading) {
    return <div>Loading...</div>;
  }

  const breadcrumb: { name: string; href?: string }[] = [
    {
      name: "Prompts",
      href: `/project/${projectId}/prompts/`,
    },
    {
      name: "New prompt",
    },
  ];

  if (initialPrompt) {
    breadcrumb.pop(); // Remove "New prompt"
    breadcrumb.push(
      {
        name: initialPrompt.name,
        href: `/project/${projectId}/prompts/${encodeURIComponent(initialPrompt.name)}`,
      },
      { name: "New version" },
    );
  }

  return (
    <div className="xl:container">
      <Header
        title={
          initialPrompt
            ? `${initialPrompt.name} \u2014 New version`
            : "Create new prompt"
        }
        help={{
          description:
            "Manage and version your prompts in Langfuse. Edit and update them via the UI and SDK. Retrieve the production version via the SDKs. Learn more in the docs.",
          href: "https://langfuse.com/docs/prompts",
        }}
        breadcrumb={breadcrumb}
      />
      {initialPrompt ? (
        <p className="text-sm text-muted-foreground">
          Prompts are immutable in Langfuse. To update a prompt, create a new
          version.
        </p>
      ) : null}
      <div className="my-8 max-w-screen-md">
        <NewPromptForm {...{ initialPrompt }} />
      </div>
    </div>
  );
};
