import { StringParam, useQueryParam } from "use-query-params";
import { NewSkillForm } from "@/src/features/skills/components/NewSkillForm";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { api } from "@/src/utils/api";
import Page from "@/src/components/layouts/page";

export const NewSkill = () => {
  const projectId = useProjectIdFromURL();
  const [initialSkillId] = useQueryParam("skillId", StringParam);

  const { data: initialSkill, isLoading } = api.skills.byId.useQuery(
    {
      projectId: projectId as string, // Typecast as query is enabled only when projectId is present
      id: initialSkillId ?? "",
    },
    {
      enabled: Boolean(initialSkillId && projectId),
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  );

  if (isLoading) {
    return <div className="p-3">Loading...</div>;
  }

  const breadcrumb: { name: string; href?: string }[] = [
    {
      name: "Skills",
      href: `/project/${projectId}/skills/`,
    },
    {
      name: "New skill",
    },
  ];

  if (initialSkill) {
    breadcrumb.pop(); // Remove "New skill"
    breadcrumb.push(
      {
        name: initialSkill.name,
        href: `/project/${projectId}/skills/${encodeURIComponent(initialSkill.name)}`,
      },
      { name: "New version" },
    );
  }

  return (
    <Page
      withPadding
      scrollable
      headerProps={{
        title: initialSkill
          ? `${initialSkill.name} — New version`
          : "Create new skill",
        help: {
          description:
            "Manage and version your skills in Langfuse. Edit and update them via the UI and SDK.",
          href: "https://langfuse.com/docs",
        },
        breadcrumb: breadcrumb,
      }}
    >
      {initialSkill ? (
        <p className="text-muted-foreground text-sm">
          Skills are immutable in Langfuse. To update a skill, create a new
          version.
        </p>
      ) : null}
      <div className="my-8">
        <NewSkillForm {...{ initialSkill }} />
      </div>
    </Page>
  );
};

export default NewSkill;
