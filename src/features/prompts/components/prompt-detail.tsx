import Header from "@/src/components/layouts/header";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import { CreatePromptDialog } from "@/src/features/prompts/components/new-prompt-button";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { api } from "@/src/utils/api";
import { extractVariables } from "@/src/utils/string";
import { type Prompt } from "@prisma/client";
import { Pencil } from "lucide-react";
import router from "next/router";

export type PromptDetailProps = {
  projectId: string;
  promptId: string;
};

export const PromptDetail = (props: PromptDetailProps) => {
  const prompt = api.prompts.byId.useQuery({
    id: props.promptId,
    projectId: props.projectId,
  });

  const extractedVariables = prompt.data
    ? extractVariables(prompt.data.prompt)
    : [];

  if (!prompt.data) {
    return <div>Loading...</div>;
  }

  return (
    <div className="flex flex-col overflow-hidden xl:container md:h-[calc(100vh-100px)] xl:h-[calc(100vh-40px)]">
      <Header
        title={`${prompt.data.name} (v${prompt.data.version})`}
        status={prompt.data.isActive ? "production" : "disabled"}
        breadcrumb={[
          {
            name: "Prompts",
            href: `/project/${props.projectId}/prompts/`,
          },
          { name: `${prompt.data.name} (v${prompt.data.version})` },
        ]}
        actionButtons={
          <>
            <CreatePromptDialog
              projectId={props.projectId}
              title="Update Prompt"
              subtitle="We do not update prompts, instead we create a new version of the prompt."
              promptName={prompt.data.name}
              promptText={prompt.data.prompt}
            >
              <Button variant="outline" size="icon">
                <Pencil className="h-5 w-5" />
              </Button>
            </CreatePromptDialog>
            <DetailPageNav
              key="nav"
              currentId={props.promptId}
              path={(id) =>
                `/project/${router.query.projectId as string}/prompts/${id}`
              }
              listKey="prompts"
            />
          </>
        }
      />

      <div className="mx-auto w-full rounded-lg border text-base leading-7 text-gray-700">
        <div className="border-b px-3 py-1 text-xs font-medium">Prompt</div>
        <p className="p-3 text-sm leading-8">{prompt.data.prompt}</p>
      </div>
      <div className="mx-auto mt-10 w-full rounded-lg border text-base leading-7 text-gray-700">
        <div className="border-b px-3 py-1 text-xs font-medium">Variables</div>
        <div className="flex flex-wrap gap-2 p-3">
          {extractedVariables.map((variable) => (
            <Badge key={variable} variant="outline">
              {variable}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
};

export function UpdatePrompt({
  projectId,
  prompt,
  isLoading,
}: {
  projectId: string;
  prompt: Prompt | undefined;
  isLoading: boolean;
}) {
  const hasAccess = useHasAccess({ projectId, scope: "prompts:CUD" });

  const handlePromptEdit = () => {
    void router.push(
      `/project/${projectId}/prompts/${prompt?.id}/edit`,
      undefined,
      {
        shallow: true,
      },
    );
  };

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={() => handlePromptEdit()}
      disabled={!hasAccess}
      loading={isLoading}
    >
      <Pencil className="h-5 w-5" />
    </Button>
  );
}
