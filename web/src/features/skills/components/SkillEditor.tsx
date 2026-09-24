import { useState } from "react";
import { useStore } from "zustand";
import { useMediaQuery } from "react-responsive";
import {
  Download,
  Eye,
  FileCode2,
  Loader2,
  Plus,
  TriangleAlert,
  RotateCcw,
} from "lucide-react";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { CodeMirrorEditor } from "@/src/components/editor";
import { PageHeaderActionsPortal } from "@/src/components/layouts/page-header-controls-slot";
import { MarkdownView } from "@/src/components/ui/MarkdownViewer";
import { Button } from "@/src/components/ui/button";
import { DialogController } from "@/src/components/ui/dialog";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/src/components/ui/resizable";
import { showErrorToast, showSuccessToast } from "@/src/features/notifications";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { createSkillVersionFromDraft } from "@/src/features/skills/actions/createSkillVersion";
import { downloadSkillVersion } from "@/src/features/skills/actions/downloadSkillVersion";
import { saveSkillLabels } from "@/src/features/skills/actions/saveSkillLabels";
import { saveSkillTags } from "@/src/features/skills/actions/saveSkillTags";
import { CreateSkillVersionDialog } from "@/src/features/skills/components/CreateSkillVersionDialog";
import { SkillFileExplorer } from "@/src/features/skills/components/SkillFileExplorer";
import { getSkillFileLanguageExtensions } from "@/src/features/skills/utils/getSkillFileLanguageExtensions";
import {
  type SkillDraftFile,
  type SkillEditorInitialValue,
  type SkillEditorStore,
} from "@/src/features/skills/components/skillEditorStore";
import {
  SkillLabelsSelect,
  SkillTagsSelect,
} from "@/src/features/skills/components/SkillMetadataSelect";
import { SkillVersionHistory } from "@/src/features/skills/components/SkillVersionHistory";
import { useSkillFileContents } from "@/src/features/skills/hooks/useSkillFileContents";
import {
  parseSkillFrontmatterMetadata,
  SKILL_NAME_RULES,
} from "@/src/features/skills/utils/parseSkillFrontmatterMetadata";
import { api } from "@/src/utils/api";

export function SkillEditor({
  projectId,
  store,
  canCreate,
  onCreated,
  history,
  metadataOptions,
}: {
  projectId: string;
  store: SkillEditorStore;
  canCreate: boolean;
  onCreated: (created: { name: string; version: number }) => Promise<void>;
  history:
    | { kind: "new" }
    | {
        kind: "versions";
        versions: Array<{
          version: number;
          labels: string[];
          commitMessage: string | null;
          createdAt: Date;
          createdBy: string;
          creator: string | null | undefined;
        }>;
        selectedVersion: number;
        hasMore: boolean;
        isLoadingMore: boolean;
        loadMoreError: boolean;
        onLoadMore: () => void;
        onSelect: (version: number) => Promise<void>;
      };
  metadataOptions: { labels: string[]; tags: string[] };
}) {
  const dirty = useStore(store, (state) => state.dirty);
  const isImporting = useStore(store, (state) => state.isImporting);
  const fileCount = useStore(store, (state) => Object.keys(state.files).length);
  const name = useStore(store, (state) => state.name);
  const baseVersion = useStore(store, (state) => state.baseVersion);
  const skillMarkdown = useStore(
    store,
    (state) => state.files["SKILL.md"]?.content,
  );
  const metadata =
    skillMarkdown === undefined
      ? null
      : parseSkillFrontmatterMetadata(skillMarkdown);
  const draftName = metadata?.name.trim() ?? name;
  let nameError: string | null = null;
  if (skillMarkdown !== undefined) {
    nameError = metadata
      ? metadata.nameError
      : `Add valid YAML frontmatter with a name in SKILL.md. ${SKILL_NAME_RULES}`;
  }
  const hasNameChanged =
    baseVersion !== null &&
    skillMarkdown !== undefined &&
    (metadata?.name.trim() ?? "") !== name;
  const createsNewSkill = baseVersion === null || hasNameChanged;
  const nameAvailability = api.skills.all.useQuery(
    { projectId, name: draftName, page: 1, limit: 1 },
    { enabled: createsNewSkill && !nameError && Boolean(draftName) },
  );
  const isCheckingName =
    createsNewSkill && !nameError && nameAvailability.isPending;
  let createDisabledReason = nameError;
  if (createsNewSkill && !nameError) {
    if (nameAvailability.data?.data.length) {
      createDisabledReason = `A skill named "${draftName}" already exists. Choose a different name.`;
    } else if (nameAvailability.isError) {
      createDisabledReason =
        "Could not check whether this skill name is available. Please try again.";
    }
  }
  const nameWarning = [
    hasNameChanged
      ? `Versions must keep the name "${name}". Reset the name or create a new skill.`
      : null,
    createDisabledReason,
  ]
    .filter(Boolean)
    .join(" ");
  const createVersion = api.skills.createVersion.useMutation();
  const setVersionLabels = api.skills.setLabels.useMutation();
  const setVersionTags = api.skills.setTags.useMutation();
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();
  const [isSaving, setIsSaving] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const isDesktop = useMediaQuery({ query: "(min-width: 768px)" });
  const createButtonTitle = canCreate
    ? (createDisabledReason ??
      (baseVersion !== null && !dirty
        ? "Edit the skill to create a new version"
        : undefined))
    : "You do not have write access";

  const save = async (createNew: boolean): Promise<boolean> => {
    if (
      !canCreate ||
      isSaving ||
      store.getState().isImporting ||
      createDisabledReason ||
      isCheckingName ||
      (!createNew && (hasNameChanged || !store.getState().dirty))
    )
      return false;
    setIsSaving(true);
    try {
      const created = await createSkillVersionFromDraft({
        projectId,
        store,
        createVersion: (input) => createVersion.mutateAsync(input),
      });
      capture("skills:version_create", {
        fileCount,
        isFirstVersion: createNew,
      });
      showSuccessToast({
        title: "Skill version created",
        description: `Version ${created.version} is now available.`,
      });
      await onCreated(created);
      return true;
    } catch (error) {
      showErrorToast(
        "Failed to create skill version",
        error instanceof Error ? error.message : "Please try again.",
      );
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const saveLabels = async (
    version: number,
    labels: string[],
  ): Promise<boolean> => {
    try {
      await saveSkillLabels({
        projectId,
        name,
        version,
        labels,
        store,
        setLabels: (input) => setVersionLabels.mutateAsync(input),
        getLabels: async (selectedVersion) =>
          (
            await utils.skills.byName.fetch({
              projectId,
              name,
              version: selectedVersion,
            })
          ).labels,
        invalidate: () =>
          Promise.all([
            utils.skills.all.invalidate(),
            utils.skills.byName.invalidate(),
            utils.skills.skillVersions.invalidate(),
          ]),
      });
      showSuccessToast({
        title: "Skill labels updated",
        description: `Version ${version} now uses the selected labels.`,
      });
      return true;
    } catch (error) {
      showErrorToast(
        "Failed to update skill labels",
        error instanceof Error ? error.message : "Please try again.",
      );
      return false;
    }
  };

  const saveTags = async (tags: string[]): Promise<boolean> => {
    if (baseVersion === null) return false;
    try {
      await saveSkillTags({
        projectId,
        name,
        version: baseVersion,
        tags,
        store,
        setTags: (input) => setVersionTags.mutateAsync(input),
        invalidate: () =>
          Promise.all([
            utils.skills.all.invalidate(),
            utils.skills.filterOptions.invalidate(),
            utils.skills.byName.invalidate(),
            utils.skills.skillVersions.invalidate(),
          ]),
      });
      showSuccessToast({
        title: "Skill tags updated",
        description: "All versions now use the selected tags.",
      });
      return true;
    } catch (error) {
      showErrorToast(
        "Failed to update skill tags",
        error instanceof Error ? error.message : "Please try again.",
      );
      return false;
    }
  };

  const download = async () => {
    if (baseVersion === null) return;
    setIsDownloading(true);
    try {
      const result = await downloadSkillVersion({
        projectId,
        name,
        version: baseVersion,
        getVersion: (input) => utils.client.skills.byName.query(input),
        getFileContent: (input) => utils.skills.fileContent.fetch(input),
      });
      capture("skills:version_download", { fileCount: result.fileCount });
    } catch {
      showErrorToast(
        "Download failed",
        "Could not download this skill version. Please try again.",
      );
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:overflow-hidden">
      <PageHeaderActionsPortal>
        <div className="flex max-w-full flex-wrap items-center justify-start gap-2 sm:justify-end">
          {baseVersion !== null ? (
            <>
              <SkillMetadataFields
                store={store}
                canEdit={canCreate}
                isSavingLabels={setVersionLabels.isPending}
                isSavingTags={setVersionTags.isPending}
                onSaveLabels={(labels) =>
                  baseVersion === null
                    ? Promise.resolve(false)
                    : saveLabels(baseVersion, labels)
                }
                onSaveTags={saveTags}
                metadataOptions={metadataOptions}
              />
              <div className="bg-border hidden h-6 w-px sm:block" />
            </>
          ) : null}
          {baseVersion !== null ? (
            <Button
              type="button"
              variant="outline"
              onClick={download}
              disabled={isDownloading}
              aria-label={`Download version ${baseVersion}`}
            >
              {isDownloading ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-1.5 h-4 w-4" />
              )}
              Download
            </Button>
          ) : null}
          {nameWarning ? (
            <Tooltip label={nameWarning}>
              {({ getTriggerProps }) => (
                <button
                  type="button"
                  aria-label="Skill name warning"
                  className="text-dark-yellow flex shrink-0 items-center"
                  {...getTriggerProps()}
                >
                  <TriangleAlert className="h-4 w-4" />
                </button>
              )}
            </Tooltip>
          ) : null}
          {hasNameChanged ? (
            <Tooltip label={`Reset name to "${name}"`}>
              {({ getTriggerProps }) => (
                <IconButton
                  {...getTriggerProps()}
                  icon={RotateCcw}
                  label="Reset skill name"
                  size="sm"
                  onClick={() => store.getState().actions.resetName()}
                />
              )}
            </Tooltip>
          ) : null}
          <DialogController<boolean>
            closeOnInteractionOutside={false}
            size="default"
            renderContent={({ state: createNew, closeDialog }) => (
              <CreateSkillVersionDialog
                store={store}
                name={createNew ? draftName : name}
                isFirstVersion={createNew}
                isSaving={isSaving}
                disabled={
                  isImporting ||
                  Boolean(createDisabledReason) ||
                  isCheckingName ||
                  (!createNew && (hasNameChanged || !dirty))
                }
                onCancel={closeDialog}
                onConfirm={async () => {
                  if (await save(createNew)) closeDialog();
                }}
              />
            )}
          >
            {({ openDialog }) => (
              <>
                {!hasNameChanged ? (
                  <Button
                    onClick={() => openDialog(baseVersion === null)}
                    disabled={
                      !canCreate ||
                      isSaving ||
                      isImporting ||
                      (baseVersion !== null && !dirty) ||
                      Boolean(createDisabledReason) ||
                      isCheckingName
                    }
                    title={createButtonTitle}
                  >
                    <Plus className="mr-1.5 h-4 w-4" />
                    {baseVersion === null ? "Create skill" : "New version"}
                  </Button>
                ) : null}
                {hasNameChanged ? (
                  <Button
                    onClick={() => openDialog(true)}
                    disabled={
                      !canCreate ||
                      isSaving ||
                      isImporting ||
                      Boolean(createDisabledReason) ||
                      isCheckingName
                    }
                    title={createButtonTitle}
                  >
                    <Plus className="mr-1.5 h-4 w-4" />
                    Create as new skill
                  </Button>
                ) : null}
              </>
            )}
          </DialogController>
        </div>
      </PageHeaderActionsPortal>
      <div className="flex min-h-[720px] flex-1 flex-col overflow-hidden border-t md:min-h-[560px] md:flex-row">
        {history.kind === "versions" ? (
          <SkillVersionHistory
            {...history}
            dirty={dirty}
            canEdit={canCreate}
            labelOptions={metadataOptions.labels}
            isSavingLabels={setVersionLabels.isPending}
            onSaveLabels={saveLabels}
          />
        ) : (
          <SkillVersionHistory kind="new" />
        )}
        <div className="min-h-[720px] min-w-0 flex-1 md:min-h-0">
          <ResizablePanelGroup
            key={isDesktop ? "desktop" : "mobile"}
            orientation={isDesktop ? "horizontal" : "vertical"}
          >
            <ResizablePanel
              defaultSize={isDesktop ? "28%" : "32%"}
              minSize={isDesktop ? "20%" : "24%"}
              maxSize={isDesktop ? "42%" : "50%"}
            >
              <SkillFileExplorer store={store} disabled={isSaving} />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel
              defaultSize={isDesktop ? "72%" : "68%"}
              minSize={isDesktop ? "45%" : "42%"}
            >
              <SkillFileEditor projectId={projectId} store={store} />
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>
    </div>
  );
}

function SkillMetadataFields({
  store,
  canEdit,
  isSavingLabels,
  isSavingTags,
  onSaveLabels,
  onSaveTags,
  metadataOptions,
}: {
  store: SkillEditorStore;
  canEdit: boolean;
  isSavingLabels: boolean;
  isSavingTags: boolean;
  onSaveLabels: (labels: string[]) => Promise<boolean>;
  onSaveTags: (tags: string[]) => Promise<boolean>;
  metadataOptions: { labels: string[]; tags: string[] };
}) {
  const labels = useStore(store, (state) => state.labels);
  const tags = useStore(store, (state) => state.tags);

  return (
    <div className="ph-no-capture flex max-w-full flex-wrap items-center gap-2">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="text-muted-foreground text-xs">Labels</span>
        <SkillLabelsSelect
          showOnlyOnHover={false}
          value={labels}
          options={metadataOptions.labels}
          disabled={!canEdit}
          isSaving={isSavingLabels}
          onSave={onSaveLabels}
        />
      </div>
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="text-muted-foreground text-xs">Tags</span>
        <SkillTagsSelect
          value={tags}
          options={metadataOptions.tags}
          disabled={!canEdit}
          isSaving={isSavingTags}
          onSave={onSaveTags}
        />
      </div>
    </div>
  );
}

function SkillFileEditor({
  projectId,
  store,
}: {
  projectId: string;
  store: SkillEditorStore;
}) {
  const activePath = useStore(store, (state) => state.activePath);
  const activeFile = useStore(store, (state) => state.files[state.activePath]!);
  const updateActiveFile = useStore(
    store,
    (state) => state.actions.updateActiveFile,
  );
  const [view, setView] = useState<"edit" | "preview">("edit");
  const fileContents = useSkillFileContents(projectId, activeFile);
  const content = activeFile.content ?? fileContents.data?.content;
  const canPreview = /\.(md|markdown)$/i.test(activePath);
  const isPreview = canPreview && view === "preview";

  let editorContent;
  if (content === undefined && fileContents.isError) {
    editorContent = (
      <div className="flex flex-col items-start gap-2 text-sm">
        <p>{fileContents.error.message}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            fileContents.refetch();
          }}
        >
          Retry
        </Button>
      </div>
    );
  } else if (content === undefined) {
    editorContent = (
      <div role="status" className="flex items-center gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading file…
      </div>
    );
  } else if (view === "preview" && canPreview) {
    editorContent = (
      <div className="prose dark:prose-invert mx-auto max-w-4xl">
        <MarkdownView markdown={content} />
      </div>
    );
  } else {
    editorContent = (
      <CodeMirrorEditor
        key={activePath}
        value={content}
        onChange={updateActiveFile}
        mode="text"
        extensions={getSkillFileLanguageExtensions(activePath)}
        minHeight="500px"
        lineNumbers
        className="h-full"
      />
    );
  }

  return (
    <section className="ph-no-capture flex h-full min-w-0 flex-col">
      <div className="flex min-h-11 items-center justify-between gap-2 border-b px-3">
        <span className="min-w-0 truncate font-mono text-xs" title={activePath}>
          {activePath}
        </span>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={!isPreview ? "secondary" : "ghost"}
            onClick={() => setView("edit")}
          >
            <FileCode2 className="mr-1 h-3.5 w-3.5" /> Edit
          </Button>
          <Button
            size="sm"
            variant={isPreview ? "secondary" : "ghost"}
            onClick={() => setView("preview")}
            disabled={!canPreview}
          >
            <Eye className="mr-1 h-3.5 w-3.5" /> Preview
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">{editorContent}</div>
    </section>
  );
}

export const NEW_SKILL_INITIAL_VALUE: SkillEditorInitialValue = {
  name: "",
  baseVersion: null,
  labels: [],
  tags: [],
  files: [
    {
      path: "SKILL.md",
      content:
        "---\nname: my-skill\ndescription: Describe when and how to use this skill.\n---\n\n# Instructions\n\nAdd instructions for the agent here.\n",
      contentType: "text/markdown",
    },
  ],
};

export function toSkillEditorInitialValue(skill: {
  name: string;
  version: number;
  labels: string[];
  tags: string[];
  files: SkillDraftFile[];
}): SkillEditorInitialValue {
  return {
    name: skill.name,
    baseVersion: skill.version,
    labels: skill.labels,
    tags: skill.tags,
    files: skill.files,
  };
}
