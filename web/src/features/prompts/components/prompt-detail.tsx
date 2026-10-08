/* eslint-disable no-nested-ternary */
import Link from "next/link";
import { useRouter } from "next/router";
import {
  NumberParam,
  StringParam,
  useQueryParam,
  withDefault,
} from "use-query-params";
import type { z } from "zod";
import { ChatMessageList } from "@/src/features/traces";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { BadgeShell } from "@/src/components/design-system/Badge/Badge";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { IO_SECTIONS_FLUSH_CLASS } from "@/src/features/traces/constants/ioSectionClasses";
import { DetailViewHeaderShell } from "@/src/features/traces/components/DetailViewHeaderShell";
import { CodeView, JSONView } from "@/src/components/ui/CodeJsonViewer";
import { DetailPageNav } from "@/src/features/navigate-detail-pages";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { api } from "@/src/utils/api";
import { getNumberFromMap } from "@/src/utils/map-utils";
import { cn } from "@/src/utils/tailwind";
import {
  extractVariables,
  PRODUCTION_LABEL,
  PromptType,
} from "@langfuse/shared";
import { getPromptTabs, PROMPT_TABS } from "@/src/features/navigation";
import { PromptHistoryNode } from "./prompt-history";
import { JumpToPlaygroundDropdownMenuController } from "@/src/features/playground";
import { ChatMlArraySchema } from "@/src/components/schemas/ChatMlSchema";
import { ObservationsTable as LegacyGenerations } from "@/src/features/tracing-tables";
import EventsTable from "@/src/features/events/components/EventsTable";
import { useReadPath } from "@/src/features/events";
import {
  FlaskConical,
  History,
  MessageSquare,
  MessageSquareOff,
  MoreVertical,
  Plus,
  Terminal,
} from "lucide-react";
import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { useHasProjectAccess } from "@/src/features/rbac";
import { Button } from "@/src/components/ui/button";
import { ActionButtonCountBadge } from "@/src/components/ui/action-button-count-badge";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import { CreateExperimentsForm } from "@/src/features/experiments";
import { useMemo, useState } from "react";
import { showSuccessToast } from "@/src/features/notifications";
import { DuplicatePromptButton } from "@/src/features/prompts/components/duplicate-prompt";
import Page from "@/src/components/layouts/page";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/src/components/ui/dropdown-menu";
import { DeletePromptVersion } from "@/src/features/prompts/components/delete-prompt-version";
import { TagPromptDetailsPopover } from "@/src/features/tag";
import { SetPromptVersionLabels } from "@/src/features/prompts/components/SetPromptVersionLabels";
import {
  CommentDrawerController,
  getCommentDrawerInitialStateFromUrl,
} from "@/src/features/comments";
import { Command, CommandInput } from "@/src/components/ui/command";
import {
  PromptReferenceProvider,
  renderRichPromptContent,
} from "@/src/components/ui/PromptReferences";
import { PromptVariableListPreview } from "@/src/features/prompts/components/PromptVariableListPreview";
import { createBreadcrumbItems } from "@/src/features/folders";
import { useIsMobile } from "@/src/hooks/use-mobile";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/src/components/ui/drawer";

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
) => `import { LangfuseClient } from "@langfuse/client";

// Initialize the Langfuse client
const langfuse = new LangfuseClient();

// Get production prompt
const prompt = await langfuse.prompt.get("${name}");

// Get by label
// You can use as many labels as you'd like to identify different deployment targets
${labels.length > 0 ? labels.map((label) => `const prompt = await langfuse.prompt.get("${name}", { label: "${label}" })`).join("\n") : ""}

// Get by version number, usually not recommended as it requires code changes to deploy new prompt versions
await langfuse.prompt.get("${name}", { version: ${version} })
`;

export const PromptDetail = ({
  promptName: promptNameProp,
}: { promptName?: string } = {}) => {
  const projectId = useProjectIdFromURL();
  const capture = usePostHogClientCapture();
  const router = useRouter();
  const { isV4 } = useReadPath();
  const isMobile = useIsMobile();

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
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);
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
  const hasCommentReadAccess = useHasProjectAccess({
    projectId,
    scope: "comments:read",
  });
  const promptHistoryInput = useMemo(
    () => ({
      name: promptName,
      projectId: projectId as string, // Typecast as query is enabled only when projectId is present
      includeCommentCounts: hasCommentReadAccess,
    }),
    [hasCommentReadAccess, projectId, promptName],
  );
  const promptHistory = api.prompts.allVersions.useQuery(promptHistoryInput, {
    enabled: Boolean(projectId),
  });
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
      meta: { silentHttpCodes: [404] },
    },
  );

  const chatMessages = useMemo<z.infer<typeof ChatMlArraySchema> | null>(() => {
    try {
      return ChatMlArraySchema.parse(
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
    return null;
  }, [
    resolutionMode,
    promptGraph.data?.resolvedPrompt,
    prompt?.prompt,
    prompt?.type,
  ]);

  const utils = api.useUtils();

  const handleExperimentSuccess = async (data?: {
    success: boolean;
    datasetId: string;
    runId: string;
    runName: string;
  }) => {
    setIsCreateExperimentDialogOpen(false);
    if (!data) return;
    utils.datasets.baseRunDataByDatasetId.invalidate();
    utils.datasets.runsByDatasetId.invalidate();
    showSuccessToast({
      operation: "experiment.trigger",
      title: "Experiment triggered successfully",
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

  const commentCounts = promptHistory.data?.commentCounts;

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

  const segments = promptName.split("/").filter((s) => s.trim());
  const folderPath = segments.length > 1 ? segments.slice(0, -1).join("/") : "";
  const breadcrumbItems = folderPath ? createBreadcrumbItems(folderPath) : [];

  const renderVersionHistory = ({
    mobile = false,
    onVersionSelect,
  }: {
    mobile?: boolean;
    onVersionSelect?: () => void;
  } = {}) => (
    <Command
      className={cn(
        "flex min-h-0 flex-col gap-2 overflow-hidden bg-transparent font-bold focus:ring-0 focus:outline-hidden focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-hidden data-focus:ring-0",
        mobile ? "rounded-none" : "rounded-none border-r px-3",
      )}
    >
      <div
        className={cn(
          "flex shrink-0 items-center justify-between",
          mobile ? "mb-1" : "-mx-3 border-b py-1.5 pr-3 pl-1",
        )}
      >
        <CommandInput
          showBorder={false}
          variant="toolbar"
          placeholder="Search"
          className="border-none py-0 focus:ring-0"
        />

        <Button
          variant="secondary"
          onClick={() => {
            capture("prompts:update_form_open");
          }}
          className={cn(
            "shrink-0",
            mobile
              ? "h-8 w-fit px-3"
              : "h-6 w-6 px-1 lg:h-7 lg:w-fit lg:px-2.5",
          )}
        >
          <Link
            className="grid w-full grid-flow-col place-items-center"
            href={`/project/${projectId}/prompts/new?promptId=${encodeURIComponent(prompt.id)}`}
          >
            <Plus className={cn("icon-base", mobile ? "mr-2" : "lg:mr-2")} />
            <span className={cn(mobile ? "inline" : "hidden lg:inline")}>
              New version
            </span>
          </Link>
        </Button>
      </div>
      <CommentDrawerController
        projectId={projectId as string}
        mode="read-only"
        onCommentChange={() =>
          utils.prompts.allVersions.invalidate(promptHistoryInput)
        }
      >
        {({ openDrawer }) => {
          const openPromptComments = (
            promptId: string,
            promptVersion: number,
          ) => {
            const { label, ...query } = router.query;
            router.push(
              {
                pathname: router.pathname,
                query: {
                  ...query,
                  version: promptVersion,
                  comments: "open",
                  commentObjectType: "PROMPT",
                  commentObjectId: promptId,
                },
              },
              undefined,
              { shallow: true },
            );
            openDrawer({
              type: "comments",
              objectId: promptId,
              objectType: "PROMPT",
            });
          };

          return (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              <PromptHistoryNode
                prompts={promptHistory.data.promptVersions}
                currentPromptVersion={prompt.version}
                setCurrentPromptVersion={(version) => {
                  setCurrentPromptVersion(version);
                  setCurrentPromptLabel(null);
                  onVersionSelect?.();
                }}
                openCommentDrawer={openPromptComments}
                commentCounts={commentCounts}
              />
            </div>
          );
        }}
      </CommentDrawerController>
    </Command>
  );

  return (
    <Page
      headerProps={{
        title: prompt.name,
        titleTooltip:
          "Prompt names cannot be changed. Instead, duplicate this prompt to a different name.",
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
          ...breadcrumbItems.map((item) => ({
            name: item.name,
            href: `/project/${projectId}/prompts?folder=${encodeURIComponent(item.folderPath)}`,
          })),
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
            includeCommentCounts={promptHistoryInput.includeCommentCounts}
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
              compact
            />
          </>
        ),
      }}
    >
      <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-4">
        {isMobile ? null : renderVersionHistory()}
        <div className="col-span-1 flex max-h-full min-h-0 min-w-0 flex-col md:col-span-3">
          {isMobile ? (
            <div className="px-4 pt-3">
              <Drawer
                open={isVersionHistoryOpen}
                onOpenChange={setIsVersionHistoryOpen}
              >
                <DrawerTrigger asChild>
                  <Button
                    variant="outline"
                    className="mb-3 w-full min-w-0 justify-start gap-2 px-3"
                  >
                    <History className="icon-base text-icon-foreground shrink-0" />
                    <span className="shrink-0">Version #{prompt.version}</span>
                    <span
                      className="text-muted-foreground min-w-0 flex-1 truncate text-left font-normal"
                      title={prompt.commitMessage ?? prompt.name}
                    >
                      {prompt.commitMessage ?? prompt.name}
                    </span>
                    <DropdownIndicator />
                  </Button>
                </DrawerTrigger>
                <DrawerContent className="max-h-[85dvh]">
                  <DrawerHeader className="shrink-0 border-b text-left">
                    <DrawerTitle>Prompt versions</DrawerTitle>
                    <DrawerDescription>
                      Select a version of {prompt.name}.
                    </DrawerDescription>
                  </DrawerHeader>
                  <div className="min-h-0 flex-1 overflow-hidden p-4 pt-2">
                    {renderVersionHistory({
                      mobile: true,
                      onVersionSelect: () => setIsVersionHistoryOpen(false),
                    })}
                  </div>
                </DrawerContent>
              </Drawer>
            </div>
          ) : null}
          <DetailViewHeaderShell>
            <div className="grid w-full grid-cols-1 items-start gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
              <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1.5">
                <span className="mr-1 inline-flex max-w-full min-w-0 items-center gap-2">
                  <BadgeShell color="inverted" font="mono" size="lg">
                    # {prompt.version}
                  </BadgeShell>
                  <span
                    className="text-primary min-w-0 truncate text-lg leading-6 font-bold"
                    title={prompt.commitMessage ?? prompt.name}
                  >
                    {prompt.commitMessage ?? prompt.name}
                  </span>
                </span>
                <SetPromptVersionLabels
                  promptLabels={prompt.labels}
                  prompt={prompt}
                  isOpen={isLabelPopoverOpen}
                  setIsOpen={setIsLabelPopoverOpen}
                />
              </div>
              <div className="flex flex-wrap items-start justify-end gap-1 lg:flex-nowrap">
                <JumpToPlaygroundDropdownMenuController
                  source="prompt"
                  prompt={{
                    ...prompt,
                    resolvedPrompt: promptGraph.data?.resolvedPrompt,
                  }}
                  analyticsEventName="prompt_detail:test_in_playground_button_click"
                >
                  {({ Trigger, disabled, title }) => (
                    <Trigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={disabled}
                        title={title}
                        className={cn(
                          "flex items-center gap-1",
                          disabled
                            ? "cursor-not-allowed opacity-50"
                            : "cursor-pointer",
                        )}
                      >
                        <Terminal className="icon-base text-icon-foreground" />
                        <span className="hidden md:inline">Playground</span>
                        <DropdownIndicator size="sm" nudge />
                      </Button>
                    </Trigger>
                  )}
                </JumpToPlaygroundDropdownMenuController>
                {hasAccess && (
                  <Dialog
                    open={isCreateExperimentDialogOpen}
                    onOpenChange={setIsCreateExperimentDialogOpen}
                  >
                    <DialogTrigger asChild disabled={!hasExperimentWriteAccess}>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!hasExperimentWriteAccess}
                        onClick={() => capture("dataset_run:new_form_open")}
                      >
                        <FlaskConical className="icon-base text-icon-foreground" />
                        <span className="hidden md:ml-2 md:inline">
                          Run experiment
                        </span>
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
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
                <CommentDrawerController
                  projectId={projectId as string}
                  initialState={() =>
                    getCommentDrawerInitialStateFromUrl(router.query)
                  }
                  count={getNumberFromMap(commentCounts, prompt.id)}
                  onCommentChange={() =>
                    utils.prompts.allVersions.invalidate(promptHistoryInput)
                  }
                >
                  {({ disabled, openDrawer }) => (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={disabled}
                      onClick={() =>
                        openDrawer({
                          type: "comments",
                          objectId: prompt.id,
                          objectType: "PROMPT",
                        })
                      }
                      className="gap-1"
                    >
                      {disabled ? (
                        <MessageSquareOff className="icon-base text-muted-foreground" />
                      ) : (
                        <>
                          <MessageSquare className="icon-base text-icon-foreground" />
                          <span>Add comment</span>
                          {getNumberFromMap(commentCounts, prompt.id) ? (
                            <ActionButtonCountBadge
                              count={
                                getNumberFromMap(commentCounts, prompt.id) ?? 0
                              }
                            />
                          ) : null}
                        </>
                      )}
                    </Button>
                  )}
                </CommentDrawerController>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <IconButton
                      icon={MoreVertical}
                      label="More actions"
                      size="sm"
                    />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="flex flex-col *:w-full *:justify-start"
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
          </DetailViewHeaderShell>
          <Tabs
            value={currentTab}
            layout="fill"
            onValueChange={(value) => setCurrentTab(value)}
          >
            <div className="max-w-full min-w-0 shrink-0 overflow-x-auto">
              <Tabs.List variant="underline">
                <Tabs.Trigger value="prompt" label="Prompt" />
                <Tabs.Trigger value="config" label="Config" />
                <Tabs.Trigger
                  value="linked-generations"
                  label="Linked Generations"
                />
                <Tabs.Trigger value="use-prompt" label="Use Prompt" />
              </Tabs.List>
            </div>
            <Tabs.Content value="linked-generations" layout="fill">
              <div className="flex h-full flex-1 flex-col overflow-hidden pb-2">
                {isV4 ? (
                  <EventsTable
                    projectId={prompt.projectId}
                    promptName={prompt.name}
                    promptVersion={prompt.version}
                    omittedFilter={["promptName"]}
                    isolateTableState
                  />
                ) : (
                  <LegacyGenerations
                    projectId={prompt.projectId}
                    promptName={prompt.name}
                    promptVersion={prompt.version}
                    omittedFilter={["promptName"]}
                  />
                )}
              </div>
            </Tabs.Content>
            <Tabs.Content value="prompt" layout="fill">
              <div
                className={cn(
                  "mb-2 flex max-h-full min-h-0 w-full flex-col gap-3 overflow-y-auto px-4 pt-3",
                  IO_SECTIONS_FLUSH_CLASS,
                )}
              >
                {promptGraph.data?.graph && (
                  <div className="flex items-center justify-end py-2">
                    <Tabs
                      value={resolutionMode}
                      onValueChange={(value) => {
                        setResolutionMode(value as "tagged" | "resolved");
                      }}
                    >
                      <Tabs.List variant="inset" gap="sm" size="md">
                        <Tabs.Trigger
                          value="resolved"
                          label="Resolved prompt"
                        />
                        <Tabs.Trigger value="tagged" label="Tagged prompt" />
                      </Tabs.List>
                    </Tabs>
                  </div>
                )}
                <PromptReferenceProvider projectId={projectId}>
                  {prompt.type === PromptType.Chat && chatMessages ? (
                    <div className="w-full">
                      <ChatMessageList
                        messages={chatMessages}
                        shouldRenderMarkdown={true}
                        currentView="pretty"
                        messageToToolCallNumbers={new Map()}
                        collapseLongHistory={false}
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
                        content={renderRichPromptContent(prompt.prompt)}
                        originalContent={prompt.prompt}
                        title="Text Prompt"
                      />
                    )
                  ) : (
                    <JSONView json={prompt.prompt} title="Prompt" />
                  )}
                </PromptReferenceProvider>
                {extractedVariables.length > 0 && (
                  <PromptVariableListPreview variables={extractedVariables} />
                )}
              </div>
            </Tabs.Content>
            <Tabs.Content value="config" layout="fill">
              <div className="flex max-h-full min-h-0 w-full flex-col overflow-y-auto px-4 pt-3 pb-4">
                <JSONView
                  json={prompt.config}
                  title="Config"
                  className="pb-2"
                />
              </div>
            </Tabs.Content>
            <Tabs.Content value="use-prompt" layout="fill">
              <div className="flex h-full min-h-0 w-full flex-col gap-3 overflow-y-auto px-4 pt-3 pb-4">
                {pythonCode && <CodeView content={pythonCode} title="Python" />}
                {jsCode && <CodeView content={jsCode} title="JS/TS" />}
                <p className="text-muted-foreground text-xs">
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
            </Tabs.Content>
          </Tabs>
        </div>
      </div>
    </Page>
  );
};
