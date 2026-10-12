import {
  type ComponentProps,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMediaQuery } from "react-responsive";
import { MAX_SKILL_FILES } from "@langfuse/shared";
import { useStore } from "zustand";
import {
  Download,
  Loader2,
  Plus,
  TriangleAlert,
  RotateCcw,
  Save,
} from "lucide-react";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { CodeMirrorEditor } from "@/src/components/editor";
import Page from "@/src/components/layouts/page";
import { Button } from "@/src/components/ui/button";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { showErrorToast, showSuccessToast } from "@/src/features/notifications";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { createSkillVersionFromDraft } from "@/src/features/skills/actions/createSkillVersion";
import { downloadSkillVersion } from "@/src/features/skills/actions/downloadSkillVersion";
import { saveSkillLabels } from "@/src/features/skills/actions/saveSkillLabels";
import { saveSkillTags } from "@/src/features/skills/actions/saveSkillTags";
import { CreateSkillVersionDialog } from "@/src/features/skills/components/CreateSkillVersionDialog";
import { Dropzone } from "@/src/components/design-system/Dropzone/Dropzone";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/src/components/ui/resizable";
import {
  SkillFileExplorer,
  type SkillFileExplorerState,
} from "@/src/features/skills/components/SkillFileExplorer";
import { importSkillFiles } from "@/src/features/skills/actions/importSkillFiles";
import { getParentFolderPaths } from "@/src/features/skills/components/skillFileTree";
import { getSkillFileLanguageExtensions } from "@/src/features/skills/utils/getSkillFileLanguageExtensions";
import {
  createSkillDraftFile,
  type SkillDraftFile,
  type SkillEditorInitialValue,
  type SkillEditorStore,
} from "@/src/features/skills/components/skillEditorStore";
import {
  SkillLabelsSelect,
  SkillTagsSelect,
} from "@/src/features/skills/components/SkillMetadataSelect";
import { SkillVersionHistory } from "@/src/features/skills/components/SkillVersionHistory";
import { SkillFilePreview } from "@/src/features/skills/components/SkillFilePreview";
import { useSkillFileContents } from "@/src/features/skills/hooks/useSkillFileContents";
import {
  parseSkillFrontmatterMetadata,
  SKILL_NAME_RULES,
} from "@/src/features/skills/utils/parseSkillFrontmatterMetadata";
import { api } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";

export function SkillEditor({
  projectId,
  store,
  canCreate,
  view,
  onCreated,
  history,
  metadataOptions,
  headerProps,
}: {
  headerProps: ComponentProps<typeof Page>["headerProps"];
  projectId: string;
  store: SkillEditorStore;
  canCreate: boolean;
  view:
    | { kind: "draft"; onDiscard: () => Promise<void> }
    | { kind: "version"; hasDraft: boolean; onEdit: () => Promise<void> };
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
        draftStore: SkillEditorStore | null;
        onSelectDraft: () => Promise<void>;
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
  const nameError = useMemo(() => {
    if (skillMarkdown === undefined) return null;
    return metadata
      ? metadata.nameError
      : `Add valid YAML frontmatter with a name in SKILL.md. ${SKILL_NAME_RULES}`;
  }, [skillMarkdown, metadata]);
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
  const createDisabledReason = useMemo(() => {
    if (!createsNewSkill || nameError) return nameError;
    if (nameAvailability.data?.data.length) {
      return `A skill named "${draftName}" already exists. Choose a different name.`;
    }
    if (nameAvailability.isError) {
      return "Could not check whether this skill name is available. Please try again.";
    }
    return nameError;
  }, [
    createsNewSkill,
    nameError,
    nameAvailability.data,
    nameAvailability.isError,
    draftName,
  ]);
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
  const isDraft = view.kind === "draft";
  const canEditFiles = isDraft && canCreate && !isSaving;
  const isDesktop = useMediaQuery({ query: "(min-width: 768px)" });
  const [treeState, setTreeState] = useState<SkillFileExplorerState>(() => ({
    selectedFolder: "",
    expandedFolders: new Set(store.getState().folders),
    pendingEntry: null,
  }));
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const showUpload = canEditFiles && isUploadOpen;
  const uploadPanelRef = useRef<HTMLElement | null>(null);
  const focusUploadPanel = useCallback((node: HTMLElement | null) => {
    uploadPanelRef.current = node;
    if (!node) return;
    const previousFocus = document.activeElement;
    node.focus();
    return () => {
      uploadPanelRef.current = null;
      requestAnimationFrame(() => {
        if (previousFocus instanceof HTMLElement) previousFocus.focus();
      });
    };
  }, []);
  const cancelUpload = () => {
    if (!store.getState().isImporting) setIsUploadOpen(false);
  };
  const createButtonTitle = canCreate
    ? (createDisabledReason ??
      (baseVersion !== null && !dirty
        ? "Edit the skill to create a new version"
        : undefined))
    : "You do not have write access";

  const save = async (createNew: boolean): Promise<boolean> => {
    if (
      !canCreate ||
      !isDraft ||
      isSaving ||
      store.getState().isImporting ||
      createDisabledReason ||
      isCheckingName ||
      (!createNew && (hasNameChanged || !store.getState().dirty))
    )
      return false;
    setIsUploadOpen(false);
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
        operation: "skill_version.create",
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
        operation: "skill_labels.update",
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
        operation: "skill_tags.update",
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
        getFileContents: (input) => utils.skills.fileContents.fetch(input),
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

  const renderHeaderActions = (
    openDialog: (
      state: { kind: "save"; createNew: boolean } | { kind: "discard" },
    ) => void,
    closeMenu?: () => void,
  ) => (
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
            <Loader2 className="icon-base text-icon-foreground mr-1.5 animate-spin" />
          ) : (
            <Download className="icon-base text-icon-foreground mr-1.5" />
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
              <TriangleAlert className="icon-base" />
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
      {!isDraft ? (
        <Button
          disabled={!canCreate}
          title={!canCreate ? "You do not have write access" : undefined}
          onClick={async () => {
            closeMenu?.();
            if (view.kind === "version") await view.onEdit();
          }}
        >
          <Plus className="icon-base mr-1.5" />
          {view.kind === "version" && view.hasDraft ? "Resume draft" : "Edit"}
        </Button>
      ) : (
        <>
          <Button
            variant="outline"
            disabled={isSaving || isImporting}
            onClick={async () => {
              closeMenu?.();
              if (view.kind !== "draft") return;
              if (dirty) openDialog({ kind: "discard" });
              else await view.onDiscard();
            }}
          >
            Discard draft
          </Button>
          <Button
            onClick={() => {
              closeMenu?.();
              openDialog({ kind: "save", createNew: createsNewSkill });
            }}
            disabled={
              !canCreate ||
              isSaving ||
              isImporting ||
              (!createsNewSkill && !dirty) ||
              Boolean(createDisabledReason) ||
              isCheckingName
            }
            title={createButtonTitle}
          >
            <Save className="icon-base mr-1.5" />
            Publish
          </Button>
        </>
      )}
    </div>
  );

  return (
    <DialogController<
      { kind: "save"; createNew: boolean } | { kind: "discard" }
    >
      renderDialog={({ state, closeDialog }) =>
        state.kind === "discard" ? (
          <Dialog
            title="Discard draft?"
            text="Your unsaved file changes and commit note will be lost."
            actions={[
              {
                label: "Discard draft",
                variant: "destructive",
                onClick: async () => {
                  if (view.kind === "draft") await view.onDiscard();
                  closeDialog();
                },
              },
            ]}
          />
        ) : (
          <CreateSkillVersionDialog
            projectId={projectId}
            store={store}
            name={state.createNew ? draftName : name}
            isFirstVersion={state.createNew}
            isSaving={isSaving}
            disabled={
              isImporting ||
              Boolean(createDisabledReason) ||
              isCheckingName ||
              (!state.createNew && (hasNameChanged || !dirty))
            }
            onConfirm={async () => {
              if (await save(state.createNew)) closeDialog();
            }}
          />
        )
      }
    >
      {({ openDialog }) => (
        <Page
          headerProps={{
            ...headerProps,
            actionButtonsRight: renderHeaderActions(openDialog),
            actionButtonsMenu: ({ closeMenu }) =>
              renderHeaderActions(openDialog, () =>
                closeMenu({ handoffFocus: true }),
              ),
          }}
        >
          <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-1">
            {showUpload ? (
              <section
                ref={focusUploadPanel}
                tabIndex={-1}
                aria-label="Upload files"
                aria-busy={isImporting}
                className="bg-background flex min-h-0 flex-col gap-3 p-4 outline-none [grid-area:1/1]"
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    cancelUpload();
                  }
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold">Upload files or folders</p>
                    {isImporting ? (
                      <p
                        role="status"
                        className="text-muted-foreground text-sm"
                      >
                        Adding files to draft…
                      </p>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={isImporting}
                    onClick={cancelUpload}
                  >
                    Cancel
                  </Button>
                </div>
                <div className="flex min-h-0 flex-1">
                  <Dropzone
                    src={undefined}
                    variant="panel"
                    accept={undefined}
                    maxFiles={MAX_SKILL_FILES}
                    maxSize={undefined}
                    minSize={undefined}
                    isDisabled={isImporting}
                    onError={(error) => {
                      showErrorToast("Could not add files", error.message);
                      uploadPanelRef.current?.focus();
                    }}
                    onDrop={async (files) => {
                      store.setState({ isImporting: true });
                      try {
                        const paths = await importSkillFiles(store, files);
                        setTreeState((current) => ({
                          selectedFolder: "",
                          pendingEntry: null,
                          expandedFolders: new Set([
                            ...current.expandedFolders,
                            ...getParentFolderPaths(paths),
                          ]),
                        }));
                        setIsUploadOpen(false);
                      } finally {
                        store.setState({ isImporting: false });
                      }
                    }}
                  />
                </div>
              </section>
            ) : null}
            <div
              className={cn(
                "flex min-h-0 flex-1 flex-col overflow-y-auto [grid-area:1/1] md:overflow-hidden",
                showUpload && "invisible",
              )}
              inert={showUpload}
              aria-hidden={showUpload}
            >
              <div className="flex min-h-[720px] flex-1 flex-col overflow-hidden border-t md:min-h-[560px] md:flex-row">
                {history.kind === "versions" ? (
                  <SkillVersionHistory
                    projectId={projectId}
                    name={name}
                    {...history}
                    isDraft={isDraft}
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
                      <SkillFileExplorer
                        store={store}
                        readOnly={!isDraft || !canCreate}
                        disabled={isSaving}
                        state={treeState}
                        onStateChange={setTreeState}
                        onUpload={() => setIsUploadOpen(true)}
                      />
                    </ResizablePanel>
                    <ResizableHandle withHandle />
                    <ResizablePanel
                      defaultSize={isDesktop ? "72%" : "68%"}
                      minSize={isDesktop ? "45%" : "42%"}
                    >
                      <SkillFileEditor
                        projectId={projectId}
                        store={store}
                        isDraft={isDraft}
                        editable={canEditFiles}
                      />
                    </ResizablePanel>
                  </ResizablePanelGroup>
                </div>
              </div>
            </div>
          </div>
        </Page>
      )}
    </DialogController>
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
  isDraft,
  editable,
}: {
  projectId: string;
  store: SkillEditorStore;
  isDraft: boolean;
  editable: boolean;
}) {
  const activePath = useStore(store, (state) => state.activePath);
  const activeFile = useStore(store, (state) => state.files[state.activePath]!);
  const updateActiveFile = useStore(
    store,
    (state) => state.actions.updateActiveFile,
  );
  const fileContents = useSkillFileContents(projectId, activeFile);
  const { refetch } = fileContents;
  const content = activeFile.content ?? fileContents.data?.content;

  const editorContent = useMemo(() => {
    if (content === undefined && fileContents.isError) {
      return (
        <div className="flex flex-col items-start gap-2 text-sm">
          <p>{fileContents.error.message}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetch();
            }}
          >
            Retry
          </Button>
        </div>
      );
    }
    if (content === undefined) {
      return (
        <div role="status" className="flex items-center gap-2 text-sm">
          <Loader2 className="icon-base animate-spin" /> Loading file…
        </div>
      );
    }
    if (!isDraft) {
      return <SkillFilePreview path={activePath} content={content} />;
    }
    return (
      <CodeMirrorEditor
        key={activePath}
        value={content}
        onChange={editable ? updateActiveFile : undefined}
        editable={editable}
        mode="text"
        extensions={getSkillFileLanguageExtensions(activePath)}
        minHeight="500px"
        lineNumbers
        className="h-full"
      />
    );
  }, [
    content,
    fileContents.isError,
    fileContents.error,
    refetch,
    activePath,
    isDraft,
    editable,
    updateActiveFile,
  ]);

  return (
    <section className="ph-no-capture flex h-full min-w-0 flex-col">
      <div className="flex min-h-11 items-center justify-between gap-2 border-b px-3">
        <span className="min-w-0 truncate font-mono text-xs" title={activePath}>
          {activePath}
        </span>
        <Badge
          text={isDraft ? "Editing draft" : "Viewing"}
          color={isDraft ? "blue" : "primary"}
        />
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
    createSkillDraftFile(
      "SKILL.md",
      "---\nname: my-skill\ndescription: Describe when and how to use this skill.\n---\n\n# Instructions\n\nAdd instructions for the agent here.\n",
    ),
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
