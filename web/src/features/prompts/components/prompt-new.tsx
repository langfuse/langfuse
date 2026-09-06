import { StringParam, useQueryParam } from "use-query-params";
import { NewPromptForm } from "@/src/features/prompts/components/NewPromptForm";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { api } from "@/src/utils/api";
import Page from "@/src/components/layouts/page";
import { useTranslations } from "next-intl";

export const NewPrompt = () => {
  const t = useTranslations("coreDetails.prompts.page");
  const projectId = useProjectIdFromURL();
  const [initialPromptId] = useQueryParam("promptId", StringParam);

  const { data: initialPrompt, isLoading } = api.prompts.byId.useQuery(
    {
      projectId: projectId as string, // Typecast as query is enabled only when projectId is present
      id: initialPromptId ?? "",
    },
    {
      enabled: Boolean(initialPromptId && projectId),
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  );

  if (isLoading) {
    return <div className="p-3">{t("loading")}</div>;
  }

  const breadcrumb: { name: string; href?: string }[] = [
    {
      name: t("title"),
      href: `/project/${projectId}/prompts/`,
    },
    {
      name: t("newPrompt"),
    },
  ];

  if (initialPrompt) {
    breadcrumb.pop(); // Remove "New prompt"
    breadcrumb.push(
      {
        name: initialPrompt.name,
        href: `/project/${projectId}/prompts/${encodeURIComponent(initialPrompt.name)}`,
      },
      { name: t("newVersion") },
    );
  }

  return (
    <Page
      withPadding
      scrollable
      headerProps={{
        title: initialPrompt
          ? t("newVersionTitle", { name: initialPrompt.name })
          : t("create"),
        help: {
          description: t("description"),
          href: "https://langfuse.com/docs/prompts",
        },
        breadcrumb: breadcrumb,
      }}
    >
      {initialPrompt ? (
        <p className="text-muted-foreground text-sm">{t("immutable")}</p>
      ) : null}
      <div className="my-8">
        <NewPromptForm {...{ initialPrompt }} />
      </div>
    </Page>
  );
};
