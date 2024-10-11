import Link from "next/link";
import { useRouter } from "next/router";
import { NumberParam, useQueryParam } from "use-query-params";
import type { z } from "zod";
import Header from "@/src/components/layouts/header";
import { OpenAiMessageView } from "@/src/components/trace/IOPreview";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { Badge } from "@/src/components/ui/badge";
import { CodeView, JSONView } from "@/src/components/ui/CodeJsonViewer";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import { PromptType } from "@/src/features/prompts/server/utils/validation";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { api } from "@/src/utils/api";
import { extractVariables } from "@/src/utils/string";
import { ScrollArea } from "@radix-ui/react-scroll-area";
import { TagPromptDetailsPopover } from "@/src/features/tag/components/TagPromptDetailsPopover";
import { PromptHistoryNode } from "./prompt-history";
import Generations from "@/src/components/table/use-cases/generations";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/src/components/ui/accordion";
import { CodeExamples } from "@/src/features/prompts/components/code-snippets";
import { JumpToPlaygroundButton } from "@/src/ee/features/playground/page/components/JumpToPlaygroundButton";
import { ChatMlArraySchema } from "@/src/components/schemas/ChatMlSchema";
import { CommentList } from "@/src/features/comments/CommentList";

export const PromptDetail = () => {
  const projectId = useProjectIdFromURL();
  const promptName = decodeURIComponent(useRouter().query.promptName as string);
  const [currentPromptVersion, setCurrentPromptVersion] = useQueryParam(
    "version",
    NumberParam,
  );
  const promptHistory = api.prompts.allVersions.useQuery(
    {
      name: promptName,
      projectId: projectId as string, // Typecast as query is enabled only when projectId is present
    },
    { enabled: Boolean(projectId) },
  );
  const prompt = currentPromptVersion
    ? promptHistory.data?.promptVersions.find(
        (prompt) => prompt.version === currentPromptVersion,
      )
    : promptHistory.data?.promptVersions[0];

  const extractedVariables = prompt
    ? extractVariables(
        prompt?.type === PromptType.Text
          ? (prompt.prompt?.toString() ?? "")
          : JSON.stringify(prompt.prompt),
      )
    : [];

  let chatMessages: z.infer<typeof ChatMlArraySchema> | null = null;
  try {
    chatMessages = ChatMlArraySchema.parse(prompt?.prompt);
  } catch (error) {
    if (PromptType.Chat === prompt?.type) {
      console.warn(
        "Could not parse returned chat prompt to pretty ChatML",
        error,
      );
    }
  }

  const allTags = (
    api.prompts.filterOptions.useQuery(
      {
        projectId: projectId as string,
      },
      {
        enabled: Boolean(projectId),
      },
    ).data?.tags ?? []
  ).map((t) => t.value);

  if (!promptHistory.data || !prompt) {
    return <div>Loading...</div>;
  }

  const codeSnippets = {
    Python: {
      langCode: "py",
      commentChar: "#",
      snippets: [
        `prompt = langfuse.get_prompt("${promptName}", label="latest")`,
        `prompt = langfuse.get_prompt("${promptName}", version=1)`,
        `prompt = langfuse.get_prompt("${promptName}", label="staging")`,
        `compiled_prompt = prompt.compile(criticlevel="expert", movie="Dune 2")`,
      ],
    },
    "JS/TS": {
      langCode: "js",
      commentChar: "//",
      snippets: [
        `const prompt = await langfuse.getPrompt("${promptName}", undefined, {label: "latest"});`,
        `const prompt = await langfuse.getPrompt("${promptName}", 1);`,
        `const prompt = await langfuse.getPrompt("${promptName}", undefined, {label: "staging"});`,
        `const compiledChatPrompt = prompt.compile({criticlevel: "expert", movie: "Dune 2"});`,
      ],
    },
  };

  const codeDescriptions = [
    "Fetch the latest production version",
    "Fetch by version",
    "Fetch by custom label you have defined",
    "Compile prompts with variables",
  ];

  return (
    <div className="flex flex-col xl:container md:h-[calc(100vh-2rem)]">
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-3">
          <Header
            title={prompt.name}
            help={{
              description:
                "You can use this prompt within your application through the Langfuse SDKs and integrations. Refer to the documentation for more information.",
              href: "https://langfuse.com/docs/prompts",
            }}
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
                <JumpToPlaygroundButton
                  source="prompt"
                  prompt={prompt}
                  analyticsEventName="prompt_detail:test_in_playground_button_click"
                  variant="outline"
                />
                <DetailPageNav
                  key="nav"
                  currentId={promptName}
                  path={(name) => `/project/${projectId}/prompts/${name}`}
                  listKey="prompts"
                />
                <Tabs value="editor">
                  <TabsList>
                    <TabsTrigger value="editor">Editor</TabsTrigger>
                    <TabsTrigger value="metrics" asChild>
                      <Link
                        href={`/project/${projectId}/prompts/${encodeURIComponent(promptName)}/metrics`}
                      >
                        Metrics
                      </Link>
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </>
            }
          />
        </div>
        <div className="col-span-3">
          <div className="mb-5 rounded-lg border bg-card font-semibold text-card-foreground">
            <div className="flex flex-row items-center gap-3 px-3 py-1">
              <span className="text-sm">Tags</span>
              <TagPromptDetailsPopover
                key={prompt.id}
                projectId={projectId as string}
                promptName={prompt.name}
                tags={prompt.tags}
                availableTags={allTags}
                className="flex-wrap"
              />
            </div>
          </div>
        </div>
        <div className="col-span-2 md:h-full">
          {prompt.type === PromptType.Chat && chatMessages ? (
            <OpenAiMessageView title="Chat prompt" messages={chatMessages} />
          ) : typeof prompt.prompt === "string" ? (
            <CodeView content={prompt.prompt} title="Text prompt" />
          ) : (
            <JSONView json={prompt.prompt} title="Prompt" />
          )}
          <div className="mx-auto mt-5 w-full rounded-lg border text-base">
            <div className="border-b px-3 py-1 text-xs font-medium">
              Variables
            </div>
            <div className="flex flex-wrap gap-2 p-2">
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
          <CodeExamples
            title="Code samples for prompt management"
            snippetLanguageConfig={codeSnippets}
            descriptions={codeDescriptions}
            docUrl="https://langfuse.com/docs/prompts"
          />
          <Accordion type="single" collapsible className="mt-10">
            <AccordionItem value="item-1">
              <AccordionTrigger>
                Generations using this prompt version
              </AccordionTrigger>
              <AccordionContent>
                <div className="flex max-h-[calc(100vh-20rem)] flex-col">
                  <Generations
                    projectId={prompt.projectId}
                    promptName={prompt.name}
                    promptVersion={prompt.version}
                    omittedFilter={["Prompt Name", "Prompt Version"]}
                  />
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
          <CommentList
            projectId={prompt.projectId}
            objectId={prompt.id}
            objectType="PROMPT"
            className="mt-10"
            cardView
          />
        </div>
        <div className="flex h-screen flex-col">
          <div className="text-m px-3 font-medium">
            <ScrollArea className="flex border-l pl-2">
              <PromptHistoryNode
                prompts={promptHistory.data.promptVersions}
                currentPromptVersion={prompt.version}
                setCurrentPromptVersion={setCurrentPromptVersion}
                totalCount={promptHistory.data.totalCount}
              />
            </ScrollArea>
          </div>
        </div>
      </div>
    </div>
  );
};
