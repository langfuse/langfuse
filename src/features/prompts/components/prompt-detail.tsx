import Header from "@/src/components/layouts/header";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { CodeView } from "@/src/components/ui/code";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import { CreatePromptDialog } from "@/src/features/prompts/components/new-prompt-button";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { api } from "@/src/utils/api";
import { extractVariables } from "@/src/utils/string";
import { type Prompt } from "@prisma/client";
import { Pencil } from "lucide-react";
import { PromptHistoryNode } from "./prompt-history";
import { PromotePrompt } from "@/src/features/prompts/components/promote-prompt";
import { ScrollArea } from "@radix-ui/react-scroll-area";
import { useQueryParam, NumberParam } from "use-query-params";
import router from "next/router";

export type PromptDetailProps = {
  projectId: string;
  promptName: string;
  //promptVersion: number;
};

export const PromptDetail = (props: PromptDetailProps) => {
  const [currentPromptVersion, setCurrentPromptVersion] = useQueryParam(
    "version",
    NumberParam,
  );
  const prompt = api.prompts.byName.useQuery({
    name: props.promptName,
    projectId: props.projectId,
    version: currentPromptVersion ?? undefined,
  });
  const promptHistory = api.prompts.history.useQuery({
    name: props.promptName,
    projectId: props.projectId,
  });

  const extractedVariables = prompt.data
    ? extractVariables(prompt.data.prompt)
    : [];

  if (!prompt.data || !promptHistory.data) {
    return <div>Loading...</div>;
  }

  return (
    <div className="flex flex-col md:h-[calc(100vh-2rem)]">
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-3">
          <Header
            title={`${prompt.data.name} (v${prompt.data.version})`}
            breadcrumb={[
              {
                name: "Prompts",
                href: `/project/${props.projectId}/prompts/`,
              },
              { name: prompt.data.name },
              { name: `Version ${prompt.data.version}` },
            ]}
            actionButtons={
              <>
                <PromotePrompt
                  projectId={props.projectId}
                  promptId={prompt.data.id}
                  promptName={prompt.data.name}
                  disabled={prompt.data.isActive}
                  variant="outline"
                />
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
                  currentId={prompt.data.name}
                  path={(name) => `/project/${props.projectId}/prompts/${name}`}
                  listKey="prompts"
                />
              </>
            }
          />
        </div>
        <div className="col-span-2 md:h-full">
          <CodeView content={prompt.data.prompt} title="Prompt" />
          <div className="mx-auto mt-5 w-full rounded-lg border text-base leading-7 text-gray-700">
            <div className="border-b px-3 py-1 text-xs font-medium">
              Variables
            </div>
            <div className="flex flex-wrap gap-2 p-3">
              {extractedVariables.length > 0 ? (
                extractedVariables.map((variable) => (
                  <Badge key={variable} variant="outline">
                    {variable}
                  </Badge>
                ))
              ) : (
                <span className="text-xs">No variables</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex h-screen flex-col">
          <div className="text-m px-3 font-medium">
            <ScrollArea className="flex border-l pl-2">
              <PromptHistoryNode
                prompts={promptHistory.data}
                currentPromptVersion={prompt.data.version}
                setCurrentPromptVersion={setCurrentPromptVersion}
              />
            </ScrollArea>
          </div>
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
