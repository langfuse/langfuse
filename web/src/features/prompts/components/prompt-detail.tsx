import Link from "next/link";
import { useRouter } from "next/router";
import {
  NumberParam,
  StringParam,
  useQueryParam,
  withDefault,
} from "use-query-params";
import type { z } from "zod";
import { OpenAiMessageView } from "@/src/components/trace/IOPreview";
import {
  TabsBar,
  TabsBarList,
  TabsBarContent,
  TabsBarTrigger,
} from "@/src/components/ui/tabs-bar";
import { Badge } from "@/src/components/ui/badge";
import { CodeView, JSONView } from "@/src/components/ui/CodeJsonViewer";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import { PromptType } from "@/src/features/prompts/server/utils/validation";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { api } from "@/src/utils/api";
import { extractVariables } from "@langfuse/shared";
import { PromptHistoryNode } from "./prompt-history";
import { JumpToPlaygroundButton } from "@/src/ee/features/playground/page/components/JumpToPlaygroundButton";
import { ChatMlArraySchema } from "@/src/components/schemas/ChatMlSchema";
import Generations from "@/src/components/table/use-cases/observations";
import { FlaskConical, MoreVertical, Plus } from "lucide-react";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { Button } from "@/src/components/ui/button";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import { CreateExperimentsForm } from "@/src/ee/features/experiments/components/CreateExperimentsForm";
import { useMemo, useState } from "react";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { DuplicatePromptButton } from "@/src/features/prompts/components/duplicate-prompt";
import Page from "@/src/components/layouts/page";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/src/components/ui/dropdown-menu";
import { DeletePromptVersion } from "@/src/features/prompts/components/delete-prompt-version";
import { TagPromptDetailsPopover } from "@/src/features/tag/components/TagPromptDetailsPopover";
import { SubHeader } from "@/src/components/layouts/header";
import { SetPromptVersionLabels } from "@/src/features/prompts/components/SetPromptVersionLabels";
import { CommentDrawerButton } from "@/src/features/comments/CommentDrawerButton";
import { Command, CommandInput } from "@/src/components/ui/command";

const getPythonCode = (
  name: string,
  version: number,
  labels: string[],
) => `from langfuse import Langfuse

# Initialize Langfuse client
langfuse = Langfuse()

# Get production prompt 
prompt = langfuse.get_prompt("${name}")

# Get by label
# You can use as many labels as you'd like to identify different deployment targets
${labels.length > 0 ? labels.map((label) => `prompt = langfuse.get_prompt("${name}", label=["${label}"])`).join("\n") : ""}

# Get by version number
# Usually not recommended as it requires code changes to deploy new prompt versions
langfuse.get_prompt("${name}", version=${version})
`;

const getJsCode = (
  name: string,
  version: number,
  labels: string[],
) => `import { Langfuse } from "langfuse";

// Initialize the Langfuse client
const langfuse = new Langfuse();

// Get production prompt 
const prompt = await langfuse.getPrompt("${name}");

// Get by label
// You can use as many labels as you'd like to identify different deployment targets
${labels.length > 0 ? labels.map((label) => `const prompt = await langfuse.getPrompt("${name}", label=["${label}"])`).join("\n") : ""}

// Get by version number
// Usually not recommended as it requires code changes to deploy new prompt versions
langfuse.getPrompt("${name}", version=${version})

}`;

export const PromptDetail = () => {
  const projectId = useProjectIdFromURL();
  const capture = usePostHogClientCapture();
  const promptName = decodeURIComponent(useRouter().query.promptName as string);
  const [currentPromptVersion, setCurrentPromptVersion] = useQueryParam(
    "version",
    NumberParam,
  );
  const [currentTab, setCurrentTab] = useQueryParam(
    "tab",
    withDefault(StringParam, "prompt"),
  );
  const [isLabelPopoverOpen, setIsLabelPopoverOpen] = useState(false);
  const [isCreateExperimentDialogOpen, setIsCreateExperimentDialogOpen] =
    useState(false);
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "prompts:CUD",
  });
  const hasEntitlement = useHasEntitlement("prompt-experiments");
  const hasExperimentWriteAccess = useHasProjectAccess({
    projectId,
    scope: "promptExperiments:CUD",
  });
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
  const utils = api.useUtils();

  const handleExperimentSuccess = async (data?: {
    success: boolean;
    datasetId: string;
    runId: string;
    runName: string;
  }) => {
    setIsCreateExperimentDialogOpen(false);
    if (!data) return;
    void utils.datasets.baseRunDataByDatasetId.invalidate();
    void utils.datasets.runsByDatasetId.invalidate();
    showSuccessToast({
      title: "Experiment run triggered successfully",
      description: "Waiting for experiment to complete...",
      link: {
        text: "View experiment",
        href: `/project/${projectId}/datasets/${data.datasetId}/compare?runs=${data.runId}`,
      },
    });
  };

  const allTags = (
    api.prompts.filterOptions.useQuery(
      {
        projectId: projectId as string,
      },
      {
        enabled: Boolean(projectId),
        trpc: {
          context: {
            skipBatch: true,
          },
        },
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        staleTime: Infinity,
      },
    ).data?.tags ?? []
  ).map((t) => t.value);

  const commentCounts = api.comments.getCountByObjectId.useQuery(
    {
      projectId: projectId as string,
      objectId: prompt?.id as string,
      objectType: "PROMPT",
    },
    {
      enabled: Boolean(projectId) && Boolean(prompt?.id),
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      refetchOnMount: false, // prevents refetching loops
    },
  );

  const { pythonCode, jsCode } = useMemo(() => {
    if (!prompt?.id) return { pythonCode: null, jsCode: null };
    const extractedVariables = extractVariables(
      prompt?.type === PromptType.Text
        ? (prompt.prompt?.toString() ?? "")
        : JSON.stringify(prompt.prompt),
    );

    return {
      pythonCode: getPythonCode(
        prompt.name,
        prompt.version,
        extractedVariables,
      ),
      jsCode: getJsCode(prompt.name, prompt.version, extractedVariables),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt?.id]);

  if (!promptHistory.data || !prompt) {
    return <div className="p-3">Loading...</div>;
  }

  return (
    <Page
      withPadding={false}
      headerProps={{
        title: prompt.name,
        itemType: "PROMPT",
        help: {
          description:
            "You can use this prompt within your application through the Langfuse SDKs and integrations. Refer to the documentation for more information.",
          href: "https://langfuse.com/docs/prompts",
        },
        breadcrumb: [
          {
            name: "Prompts",
            href: `/project/${projectId}/prompts/`,
          },
          {
            name: prompt.name,
            href: `/project/${projectId}/prompts/${encodeURIComponent(promptName)}`,
          },
        ],
        tabsComponent: (
          <TabsBar value="versions">
            <TabsBarList className="justify-start">
              <TabsBarTrigger value="versions">Versions</TabsBarTrigger>
              <TabsBarTrigger value="metrics" asChild>
                <Link
                  href={`/project/${projectId}/prompts/${encodeURIComponent(promptName)}/metrics`}
                >
                  Metrics
                </Link>
              </TabsBarTrigger>
            </TabsBarList>
          </TabsBar>
        ),
        actionButtonsLeft: (
          <TagPromptDetailsPopover
            tags={prompt.tags}
            availableTags={allTags}
            projectId={projectId as string}
            promptName={prompt.name}
          />
        ),
        actionButtonsRight: (
          <>
            {projectId && (
              <DuplicatePromptButton
                promptId={prompt.id}
                projectId={projectId}
                promptName={prompt.name}
                promptVersion={prompt.version}
              />
            )}
            <DetailPageNav
              key="nav"
              currentId={promptName}
              path={(entry) =>
                `/project/${projectId}/prompts/${entry.id}?tab=${currentTab}`
              }
              listKey="prompts"
            />
          </>
        ),
      }}
    >
      <div className="grid flex-1 grid-cols-3 gap-4 overflow-hidden px-3 md:grid-cols-4">
        <Command
          filter={(value, search) => {
            // Always show current version
            if (value.includes(`# ${prompt.version}`)) return 1;
            // Default filtering for other items
            const normalizedSearch = search.toLowerCase();
            const normalizedValue = value.toLowerCase();
            return normalizedValue.includes(normalizedSearch) ? 1 : 0;
          }}
          className="flex flex-col gap-2 overflow-y-auto rounded-none border-r pr-3 font-medium focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 data-[focus]:ring-0"
        >
          <div className="mt-3 flex items-center justify-between">
            <CommandInput
              showBorder={false}
              placeholder="Search versions"
              className="h-fit border-none py-0 text-sm font-light text-muted-foreground focus:ring-0"
            />

            <Button
              size="icon"
              onClick={() => {
                capture("prompts:update_form_open");
              }}
              className="shrink-0"
            >
              <Link
                className="grid w-full place-items-center"
                href={`/project/${projectId}/prompts/new?promptId=${encodeURIComponent(prompt.id)}`}
              >
                <Plus className="h-4 w-4" />
              </Link>
            </Button>
          </div>
          <div className="flex flex-col overflow-y-auto">
            <PromptHistoryNode
              prompts={promptHistory.data.promptVersions}
              currentPromptVersion={prompt.version}
              setCurrentPromptVersion={setCurrentPromptVersion}
              totalCount={promptHistory.data.totalCount}
            />
          </div>
        </Command>
        <div className="col-span-2 mt-3 flex max-h-full min-h-0 flex-col md:col-span-3">
          <div className="flex flex-col items-start gap-2">
            <div className="grid w-full min-w-0 grid-cols-[auto,auto] items-center justify-between">
              <div className="flex min-w-0 max-w-full flex-shrink flex-col">
                <div className="flex min-w-0 max-w-full flex-wrap items-start gap-1">
                  <SetPromptVersionLabels
                    title={
                      <div
                        className="contents !cursor-default"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Badge
                          variant="outline"
                          className="mr-1 h-6 text-nowrap"
                        >
                          # {prompt.version}
                        </Badge>
                        <SubHeader
                          title={prompt.commitMessage ?? prompt.name}
                          className="mb-0 min-w-0 max-w-full"
                        />
                      </div>
                    }
                    promptLabels={prompt.labels}
                    prompt={prompt}
                    isOpen={isLabelPopoverOpen}
                    setIsOpen={setIsLabelPopoverOpen}
                  />
                </div>

                <div className="min-h-1 flex-1" />
              </div>
              <div className="flex h-full flex-wrap items-start justify-end gap-1 lg:flex-nowrap">
                <JumpToPlaygroundButton
                  source="prompt"
                  prompt={prompt}
                  analyticsEventName="prompt_detail:test_in_playground_button_click"
                  variant="outline"
                />
                {hasAccess && hasEntitlement && (
                  <Dialog
                    open={isCreateExperimentDialogOpen}
                    onOpenChange={setIsCreateExperimentDialogOpen}
                  >
                    <DialogTrigger asChild disabled={!hasExperimentWriteAccess}>
                      <Button
                        variant="outline"
                        disabled={!hasExperimentWriteAccess}
                        onClick={() => capture("dataset_run:new_form_open")}
                      >
                        <FlaskConical className="h-4 w-4" />
                        <span className="hidden md:ml-2 md:inline">
                          Experiment
                        </span>
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <CreateExperimentsForm
                        key={`create-experiment-form-${prompt.id}`}
                        projectId={projectId as string}
                        setFormOpen={setIsCreateExperimentDialogOpen}
                        defaultValues={{
                          promptId: prompt.id,
                        }}
                        promptDefault={{
                          name: prompt.name,
                          version: prompt.version,
                        }}
                        handleExperimentSuccess={handleExperimentSuccess}
                      />
                    </DialogContent>
                  </Dialog>
                )}
                <CommentDrawerButton
                  projectId={projectId as string}
                  objectId={prompt.id}
                  objectType="PROMPT"
                  count={commentCounts?.data?.get(prompt.id)}
                  variant="outline"
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="flex flex-col [&>*]:w-full [&>*]:justify-start"
                  >
                    <DropdownMenuItem asChild>
                      <DeletePromptVersion
                        promptVersionId={prompt.id}
                        version={prompt.version}
                        countVersions={promptHistory.data.totalCount}
                      />
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
          <TabsBar
            value={currentTab}
            className="min-h-0"
            onValueChange={(value) => setCurrentTab(value)}
          >
            <TabsBarList className="min-w-0 max-w-full justify-start overflow-x-auto">
              <TabsBarTrigger value="prompt">Prompt</TabsBarTrigger>
              <TabsBarTrigger value="config">Config</TabsBarTrigger>
              <TabsBarTrigger value="linked-generations">
                Linked Generations
              </TabsBarTrigger>
              <TabsBarTrigger value="use-prompt">Use Prompt</TabsBarTrigger>
            </TabsBarList>
            <TabsBarContent
              value="linked-generations"
              className="mb-2 mt-0 flex max-h-full min-h-0 flex-1 flex-col overflow-hidden"
            >
              <div className="flex h-full flex-1 flex-col overflow-hidden">
                <Generations
                  projectId={prompt.projectId}
                  promptName={prompt.name}
                  promptVersion={prompt.version}
                  omittedFilter={["Prompt Name", "Prompt Version"]}
                />
              </div>
            </TabsBarContent>
            <TabsBarContent
              value="prompt"
              className="mt-0 flex max-h-full min-h-0 flex-1 overflow-hidden"
            >
              <div className="mb-2 flex max-h-full min-h-0 w-full flex-col overflow-y-auto">
                {prompt.type === PromptType.Chat && chatMessages ? (
                  <OpenAiMessageView
                    messages={chatMessages}
                    collapseLongHistory={false}
                  />
                ) : typeof prompt.prompt === "string" ? (
                  <CodeView content={prompt.prompt} title="Text prompt" />
                ) : (
                  <JSONView json={prompt.prompt} title="Prompt" />
                )}
              </div>
            </TabsBarContent>
            <TabsBarContent
              value="config"
              className="mt-0 flex max-h-full min-h-0 flex-1 overflow-hidden"
            >
              <div className="flex max-h-full min-h-0 w-full flex-col overflow-y-auto pb-4">
                <JSONView
                  json={prompt.config}
                  title="Config"
                  className="pb-2"
                />
              </div>
            </TabsBarContent>
            <TabsBarContent
              value="use-prompt"
              className="mt-0 flex max-h-full min-h-0 flex-1 overflow-hidden"
            >
              <div className="flex h-full min-h-0 w-full flex-col gap-2 overflow-y-auto pb-4">
                {pythonCode && <CodeView content={pythonCode} title="Python" />}
                {jsCode && <CodeView content={jsCode} title="JS/TS" />}
                <p className="pl-1 text-xs text-muted-foreground">
                  See{" "}
                  <a
                    href="https://langfuse.com/docs/prompts"
                    className="underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    documentation
                  </a>{" "}
                  for more details on how to use prompts in frameworks.
                </p>
              </div>
            </TabsBarContent>
          </TabsBar>
        </div>
      </div>
    </Page>
  );
};
