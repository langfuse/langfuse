import { Pencil, Terminal } from "lucide-react";
import Link from "next/link";
import router, { useRouter } from "next/router";
import { NumberParam, useQueryParam } from "use-query-params";
import type { z } from "zod";

import Header from "@/src/components/layouts/header";
import {
  ChatMlArraySchema,
  OpenAiMessageView,
} from "@/src/components/trace/IOPreview";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { CodeView, JSONView } from "@/src/components/ui/code";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import { DeletePromptVersion } from "@/src/features/prompts/components/delete-prompt-version";
import { PromotePrompt } from "@/src/features/prompts/components/promote-prompt";
import { PromptType } from "@/src/features/prompts/server/validation";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { api } from "@/src/utils/api";
import { extractVariables } from "@/src/utils/string";
import { type Prompt } from "@langfuse/shared/src/db";
import { ScrollArea } from "@radix-ui/react-scroll-area";

import { PromptHistoryNode } from "./prompt-history";
import useIsFeatureEnabled from "@/src/features/feature-flags/hooks/useIsFeatureEnabled";

export const PromptDetail = () => {
  const projectId = useProjectIdFromURL();
  const isPlaygroundEnabled = useIsFeatureEnabled("playground");
  const promptName = decodeURIComponent(useRouter().query.promptName as string);
  const [currentPromptVersion, setCurrentPromptVersion] = useQueryParam(
    "version",
    NumberParam,
  );
  const promptHistory = api.prompts.allVersions.useQuery({
    name: promptName,
    projectId,
  });
  const prompt = currentPromptVersion
    ? promptHistory.data?.find(
        (prompt) => prompt.version === currentPromptVersion,
      )
    : promptHistory.data?.[0];

  const extractedVariables = prompt
    ? extractVariables(JSON.stringify(prompt.prompt))
    : [];

  let chatMessages: z.infer<typeof ChatMlArraySchema> | null = null;
  try {
    chatMessages = ChatMlArraySchema.parse(prompt?.prompt);
  } catch (error) {
    console.warn(
      "Could not parse returned chat prompt to pretty ChatML",
      error,
    );
  }

  if (!promptHistory.data || !prompt) {
    return <div>Loading...</div>;
  }

  return (
    <div className="flex flex-col xl:container md:h-[calc(100vh-2rem)]">
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-3">
          <Header
            title={prompt.name}
            breadcrumb={[
              {
                name: "Prompts",
                href: `/project/${projectId}/prompts/`,
              },
              {
                name: prompt.name,
                href: `/project/${projectId}/prompts/${encodeURIComponent(promptName)}`,
              },
              { name: `Version ${prompt.version}` },
            ]}
            actionButtons={
              <>
                <PromotePrompt
                  projectId={projectId}
                  promptId={prompt.id}
                  promptName={prompt.name}
                  disabled={prompt.isActive}
                  variant="outline"
                />

                {isPlaygroundEnabled ? (
                  <Link
                    href={`/project/${projectId}/playground?promptId=${encodeURIComponent(prompt.id)}`}
                  >
                    <Button
                      variant="outline"
                      title="Test in prompt playground"
                      size="icon"
                    >
                      <Terminal className="h-5 w-5" />
                    </Button>
                  </Link>
                ) : null}

                <Link
                  href={`/project/${projectId}/prompts/new?promptId=${encodeURIComponent(prompt.id)}`}
                >
                  <Button variant="outline" size="icon">
                    <Pencil className="h-5 w-5" />
                  </Button>
                </Link>

                <DeletePromptVersion
                  projectId={projectId}
                  promptVersionId={prompt.id}
                  version={prompt.version}
                  countVersions={promptHistory.data.length}
                />
                <DetailPageNav
                  key="nav"
                  currentId={promptName}
                  path={(name) => `/project/${projectId}/prompts/${name}`}
                  listKey="prompts"
                />
              </>
            }
          />
        </div>
        <div className="col-span-2 md:h-full">
          {prompt.type === PromptType.Chat && chatMessages ? (
            <OpenAiMessageView title="Chat prompt" messages={chatMessages} />
          ) : typeof prompt.prompt === "string" ? (
            <CodeView content={prompt.prompt} title="Text prompt" />
          ) : (
            <JSONView json={prompt.prompt} title="Prompt" />
          )}
          <div className="mx-auto mt-5 w-full rounded-lg border text-base leading-7">
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

          {prompt.config && JSON.stringify(prompt.config) !== "{}" && (
            <JSONView className="mt-5" json={prompt.config} title="Config" />
          )}
        </div>
        <div className="flex h-screen flex-col">
          <div className="text-m px-3 font-medium">
            <ScrollArea className="flex border-l pl-2">
              <PromptHistoryNode
                prompts={promptHistory.data}
                currentPromptVersion={prompt.version}
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
