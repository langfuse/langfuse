import Link from "next/link";
import { useRouter } from "next/router";
import {
  NumberParam,
  StringParam,
  useQueryParam,
  withDefault,
} from "use-query-params";
import type { z } from "zod/v4";
import { OpenAiMessageView } from "@/src/components/trace/IOPreview";
import {
  TabsBar,
  TabsBarList,
  TabsBarContent,
  TabsBarTrigger,
} from "@/src/components/ui/tabs-bar";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { Badge } from "@/src/components/ui/badge";
import { CodeView, JSONView } from "@/src/components/ui/CodeJsonViewer";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { api } from "@/src/utils/api";
import {
  extractVariables,
  PRODUCTION_LABEL,
  PromptType,
} from "@langfuse/shared";
import {
  getPromptTabs,
  PROMPT_TABS,
} from "@/src/features/navigation/utils/prompt-tabs";
import { PromptHistoryNode } from "./prompt-history";
import { JumpToPlaygroundButton } from "@/src/features/playground/page/components/JumpToPlaygroundButton";
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
import { CreateExperimentsForm } from "@/src/features/experiments/components/CreateExperimentsForm";
import { useMemo, useState } from "react";
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
import { SetPromptVersionLabels } from "@/src/features/prompts/components/SetPromptVersionLabels";
import { CommentDrawerButton } from "@/src/features/comments/CommentDrawerButton";
import { Command, CommandInput } from "@/src/components/ui/command";
import { renderContentWithPromptButtons } from "@/src/features/prompts/components/renderContentWithPromptButtons";
import { PromptVariableListPreview } from "@/src/features/prompts/components/PromptVariableListPreview";

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
${labels.length > 0 ? labels.map((label) => `prompt = langfuse.get_prompt("${name}", label="${label}")`).join("\n") : ""}

# Get by version number, usually not recommended as it requires code changes to deploy new prompt versions
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
${labels.length > 0 ? labels.map((label) => `const prompt = await langfuse.getPrompt("${name}", undefined, { label: "${label}" })`).join("\n") : ""}

// Get by version number, usually not recommended as it requires code changes to deploy new prompt versions
langfuse.getPrompt("${name}", ${version})
`;

export const PromptDetail = ({
  promptName: promptNameProp,
}: { promptName?: string } = {}) => {
  const projectId = useProjectIdFromURL();
  const capture = usePostHogClientCapture();
  const router = useRouter();

  const promptName =
    promptNameProp ||
    (router.query.promptName
      ? decodeURIComponent(router.query.promptName as string)
      : "");
  const [currentPromptVersion, setCurrentPromptVersion] = useQueryParam(
    "version",
    NumberParam,
  );
  const [currentPromptLabel, setCurrentPromptLabel] = useQueryParam(
    "label",
    StringParam,
  );
  const [currentTab, setCurrentTab] = useQueryParam(
    "tab",
    withDefault(StringParam, "prompt"),
  );
  const [isLabelPopoverOpen, setIsLabelPopoverOpen] = useState(false);
  const [isCreateExperimentDialogOpen, setIsCreateExperimentDialogOpen] =
    useState(false);
  const [resolutionMode, setResolutionMode] = useState<"tagged" | "resolved">(
    "tagged",
  );
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "prompts:CUD",
  });

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
    : currentPromptLabel
      ? promptHistory.data?.promptVersions.find((prompt) =>
          prompt.labels.includes(currentPromptLabel),
        )
      : promptHistory.data?.promptVersions[0];

  const promptGraph = api.prompts.resolvePromptGraph.useQuery(
    {
      promptId: prompt?.id as string,
      projectId: projectId as string,
    },
    {
      enabled: Boolean(projectId) && Boolean(prompt?.id),
    },
  );

  let chatMessages: z.infer<typeof ChatMlArraySchema> | null = null;
  try {
    chatMessages = ChatMlArraySchema.parse(
      resolutionMode === "resolved"
        ? promptGraph.data?.resolvedPrompt
        : prompt?.prompt,
    );
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
    const sortedLabels = [...prompt.labels].sort((a, b) => {
      if (a === PRODUCTION_LABEL) return -1;
      if (b === PRODUCTION_LABEL) return 1;
      return a.localeCompare(b);
    });

    return {
      pythonCode: getPythonCode(prompt.name, prompt.version, sortedLabels),
      jsCode: getJsCode(prompt.name, prompt.version, sortedLabels),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt?.id]);

  if (!promptHistory.data || !prompt) {
    return <div className="p-3">Loading...</div>;
  }

  const extractedVariables = prompt
    ? extractVariables(
        prompt?.type === PromptType.Text
          ? (prompt.prompt?.toString() ?? "")
          : JSON.stringify(prompt.prompt),
      )
    : [];

  return (
    <Page
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
        ],
        tabsProps: {
          tabs: getPromptTabs(projectId as string, promptName as string),
          activeTab: PROMPT_TABS.VERSIONS,
        },
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
        <Command className="flex flex-col gap-2 overflow-y-auto rounded-none border-r pr-3 font-medium focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 data-[focus]:ring-0">
          <div className="mt-3 flex items-center justify-between">
            <CommandInput
              showBorder={false}
              placeholder="Search versions"
              className="h-fit border-none py-0 text-sm font-light text-muted-foreground focus:ring-0"
            />

            <Button
              onClick={() => {
                capture("prompts:update_form_open");
              }}
              className="h-6 w-6 shrink-0 px-1 md:h-8 md:w-fit md:px-3"
            >
              <Link
                className="grid w-full place-items-center md:grid-flow-col"
                href={`/project/${projectId}/prompts/new?promptId=${encodeURIComponent(prompt.id)}`}
              >
                <Plus className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">New</span>
              </Link>
            </Button>
          </div>
          <div className="flex flex-col overflow-y-auto">
            <PromptHistoryNode
              prompts={promptHistory.data.promptVersions}
              currentPromptVersion={prompt.version}
              setCurrentPromptVersion={(version) => {
                setCurrentPromptVersion(version);
                setCurrentPromptLabel(null);
              }}
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
                        <span className="mb-0 line-clamp-2 min-w-0 break-all text-lg font-medium md:break-normal md:break-words">
                          {prompt.commitMessage ?? prompt.name}
                        </span>
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
              <div className="flex h-full flex-wrap content-start items-start justify-end gap-1 lg:flex-nowrap">
                <JumpToPlaygroundButton
                  source="prompt"
                  prompt={{
                    ...prompt,
                    resolvedPrompt: promptGraph.data?.resolvedPrompt,
                  }}
                  analyticsEventName="prompt_detail:test_in_playground_button_click"
                  variant="outline"
                />
                {hasAccess && (
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
                    <DialogContent className="max-h-[90vh] overflow-y-auto">
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
              <div className="mb-2 flex max-h-full min-h-0 w-full flex-col gap-2 overflow-y-auto">
                {promptGraph.data?.graph && (
                  <div className="flex items-center justify-end py-2">
                    <Tabs
                      value={resolutionMode}
                      onValueChange={(value) => {
                        setResolutionMode(value as "tagged" | "resolved");
                      }}
                    >
                      <TabsList className="h-auto gap-1">
                        <TabsTrigger
                          value="resolved"
                          className="h-fit px-1 text-xs"
                        >
                          Resolved prompt
                        </TabsTrigger>
                        <TabsTrigger
                          value="tagged"
                          className="h-fit px-1 text-xs"
                        >
                          Tagged prompt
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                )}
                {prompt.type === PromptType.Chat && chatMessages ? (
                  <div className="w-full">
                    <OpenAiMessageView
                      messages={chatMessages}
                      collapseLongHistory={false}
                      projectIdForPromptButtons={projectId}
                    />
                  </div>
                ) : typeof prompt.prompt === "string" ? (
                  resolutionMode === "resolved" &&
                  promptGraph.data?.resolvedPrompt ? (
                    <CodeView
                      content={String(promptGraph.data.resolvedPrompt)}
                      title="Text Prompt (resolved)"
                    />
                  ) : (
                    <CodeView
                      content={renderContentWithPromptButtons(
                        projectId as string,
                        prompt.prompt,
                      )}
                      title="Text Prompt"
                    />
                  )
                ) : (
                  <JSONView json={prompt.prompt} title="Prompt" />
                )}
                <PromptVariableListPreview variables={extractedVariables} />
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
                  for more details on how to use prompts in frameworks such as
                  Langchain.
                </p>
              </div>
            </TabsBarContent>
          </TabsBar>
        </div>
      </div>
    </Page>
  );
};
