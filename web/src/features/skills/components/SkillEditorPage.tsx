/* eslint-disable @repo/component-file-structure */
import { type ComponentProps, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { TRPCClientError } from "@trpc/client";
import { useStore } from "zustand";
import Page from "@/src/components/layouts/Page";
import { Skeleton } from "@/src/components/ui/skeleton";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { SKILL_LATEST_LABEL } from "@langfuse/shared";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  NEW_SKILL_INITIAL_VALUE,
  SkillEditor,
  toSkillEditorInitialValue,
} from "@/src/features/skills/components/SkillEditor";
import {
  createSkillEditorStore,
  type SkillEditorInitialValue,
  type SkillEditorStore,
} from "@/src/features/skills/components/skillEditorStore";
import {
  createSkillDraft,
  restoreSkillDraft,
  skillDraftStorageKey,
  type SkillDraft,
} from "@/src/features/skills/components/skillDraftStorage";
import { Button } from "@/src/components/design-system/Button/Button";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { useStoredSkillDraft } from "@/src/features/skills/hooks/useStoredSkillDraft";
import { parseSkillFrontmatterMetadata } from "@/src/features/skills/utils/parseSkillFrontmatterMetadata";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { api } from "@/src/utils/api";
import { classifyTrpcToastError } from "@/src/utils/trpcErrorClassification";

export function NewSkillPage() {
  const router = useRouter();
  const projectId = useProjectIdFromURL();
  const canCreate = useHasProjectAccess({
    projectId: projectId ?? "",
    scope: "skills:CUD",
  });
  const utils = api.useUtils();
  const filterOptions = api.skills.filterOptions.useQuery(
    { projectId: projectId ?? "" },
    { enabled: Boolean(projectId), refetchOnWindowFocus: false },
  );
  const draftKey = skillDraftStorageKey(projectId ?? "", null);
  const [storedDraft] = useState(() => restoreSkillDraft(draftKey));
  const [draft, setDraft] = useState(
    () =>
      storedDraft ?? createSkillDraft(draftKey, NEW_SKILL_INITIAL_VALUE, null),
  );
  const store = draft.store;
  const skillMarkdown = useStore(
    store,
    (state) => state.files["SKILL.md"]?.content ?? "",
  );
  const metadata = parseSkillFrontmatterMetadata(skillMarkdown);

  return (
    <>
      {storedDraft ? (
        <DialogController
          initialState={() => true}
          onDismiss={() => {
            storedDraft.discard();
            setDraft(createSkillDraft(draftKey, NEW_SKILL_INITIAL_VALUE, null));
          }}
          renderDialog={({ closeDialog }) => (
            <Dialog
              title="Continue your draft?"
              text="You have an unsaved skill draft from earlier in this tab."
              requireExplicitClose
              closeLabel="Start new"
              actions={[{ label: "Continue draft", onClick: closeDialog }]}
            />
          )}
        >
          {() => null}
        </DialogController>
      ) : null}
      <SkillEditor
        key={draft === storedDraft ? "stored-draft" : "new-draft"}
        headerProps={{
          title: metadata?.name.trim() ? metadata.name : "Create skill",
          help:
            metadata && !metadata.nameError
              ? {
                  description:
                    "The skill name and description are parsed from the frontmatter in SKILL.md.",
                }
              : undefined,
          breadcrumb: [
            { name: "Skills", href: `/project/${projectId}/skills` },
            { name: "New skill" },
          ],
        }}
        projectId={projectId ?? ""}
        store={store}
        canCreate={canCreate}
        view={{
          kind: "draft",
          onDiscard: async () => {
            draft.discard();
            await router.push(`/project/${projectId}/skills`);
          },
        }}
        history={{ kind: "new" }}
        metadataOptions={{
          labels: ["production"],
          tags: filterOptions.data?.tags.map((tag) => tag.value) ?? [],
        }}
        onCreated={async (created) => {
          draft.discard();
          await Promise.all([
            utils.skills.all.invalidate(),
            utils.skills.filterOptions.invalidate(),
          ]);
          await router.push(
            `/project/${projectId}/skills/${encodeURIComponent(created.name)}?version=${created.version}`,
          );
        }}
      />
    </>
  );
}

export function ExistingSkillPage() {
  const router = useRouter();
  const projectId = useProjectIdFromURL();
  const skillName =
    typeof router.query.skillName === "string" ? router.query.skillName : "";
  return (
    <ExistingSkillSession
      key={`${projectId}:${skillName}`}
      projectId={projectId ?? ""}
      skillName={skillName}
    />
  );
}

function ExistingSkillSession({
  projectId,
  skillName,
}: {
  projectId: string;
  skillName: string;
}) {
  const draftKey = skillDraftStorageKey(projectId, skillName);
  const storedDraft = useStoredSkillDraft({ projectId, skillName, draftKey });
  const headerProps: ComponentProps<typeof Page>["headerProps"] = {
    title: skillName,
    breadcrumb: [
      { name: "Skills", href: `/project/${projectId}/skills` },
      { name: "Editor" },
    ],
  };

  if (storedDraft.status === "loading") {
    return (
      <Page headerProps={headerProps}>
        <div className="grid gap-3 p-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-[600px] w-full" />
        </div>
      </Page>
    );
  }

  if (storedDraft.status === "error") {
    return (
      <Page headerProps={headerProps}>
        <div className="grid justify-items-start gap-3 p-6 text-sm">
          <p>Could not load your saved draft.</p>
          <div className="flex gap-2">
            <Button
              text="Retry"
              loading={storedDraft.isRetrying}
              onClick={storedDraft.retry}
            />
            <Button
              text="Discard draft"
              variant="outline"
              onClick={storedDraft.discard}
            />
          </div>
        </div>
      </Page>
    );
  }

  return (
    <ExistingSkillEditorSession
      projectId={projectId}
      skillName={skillName}
      draftKey={draftKey}
      createInitialDraft={storedDraft.createInitialDraft}
    />
  );
}

function ExistingSkillEditorSession({
  projectId,
  skillName,
  draftKey,
  createInitialDraft,
}: {
  projectId: string;
  skillName: string;
  draftKey: string;
  createInitialDraft: () => SkillDraft | null;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<SkillDraft | null>(createInitialDraft);
  const draftStore = draft?.store ?? null;
  // Opening a skill without a version or draft in the URL resumes its stored
  // draft at the version it is based on.
  const opensStoredDraft =
    draftStore !== null &&
    router.query.version === undefined &&
    router.query.draft === undefined;
  const isDraft =
    draftStore !== null && (opensStoredDraft || router.query.draft === "true");
  const urlVersion =
    typeof router.query.version === "string"
      ? Number(router.query.version)
      : undefined;
  const requestedVersion = opensStoredDraft
    ? (draftStore.getState().baseVersion ?? undefined)
    : urlVersion;
  const version = Number.isInteger(requestedVersion)
    ? requestedVersion
    : undefined;
  const canCreate = useHasProjectAccess({
    projectId: projectId ?? "",
    scope: "skills:CUD",
  });
  const utils = api.useUtils();
  const filterOptions = api.skills.filterOptions.useQuery(
    {
      projectId: projectId ?? "",
    },
    {
      enabled: Boolean(projectId && skillName),
      refetchOnWindowFocus: false,
    },
  );
  const skill = api.skills.byName.useQuery(
    {
      projectId: projectId ?? "",
      name: skillName,
      ...(version ? { version } : { label: "latest" }),
    },
    {
      enabled: Boolean(projectId && skillName),
      refetchOnWindowFocus: false,
    },
  );

  const history = api.skills.skillVersions.useInfiniteQuery(
    { projectId: projectId ?? "", name: skillName, limit: 20 },
    {
      getNextPageParam: (page) => page.nextCursor,
      enabled: Boolean(projectId && skillName),
      refetchOnWindowFocus: false,
    },
  );
  const error =
    (skill.data ? null : skill.error) ?? (history.data ? null : history.error);

  const headerProps: ComponentProps<typeof Page>["headerProps"] = {
    title: skill.data?.name ?? skillName,
    help: skill.data
      ? {
          description: "Edit SKILL.md to change the skill name.",
        }
      : undefined,
    breadcrumb: [
      { name: "Skills", href: `/project/${projectId}/skills` },
      { name: "Editor" },
    ],
  };

  const content = useMemo(() => {
    if (error) {
      return <div className="ph-no-capture p-6 text-sm">{error.message}</div>;
    }
    if (skill.isPending || history.isPending) {
      return (
        <div className="grid gap-3 p-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-[600px] w-full" />
        </div>
      );
    }
    return <div className="p-6 text-sm">Skill version not found.</div>;
  }, [error, skill.isPending, history.isPending]);

  if (
    !error &&
    !skill.isPending &&
    !history.isPending &&
    skill.data &&
    history.data
  ) {
    const initialValue = toSkillEditorInitialValue({
      ...skill.data,
      files: skill.data.files.map((file) => ({
        path: file.path,
        currentSha: file.sha256Hash,
        sourceSha: file.sha256Hash,
        sourceContentLength: file.contentLength,
      })),
    });
    async function selectDraft() {
      const selected =
        draft ?? createSkillDraft(draftKey, initialValue, skill.data!.id);
      const baseVersion = selected.store.getState().baseVersion;
      if (draft && baseVersion !== null) {
        const discardMissingBase = () => {
          draft.discard();
          setDraft(null);
          showErrorToast(
            "Draft discarded",
            `Version ${baseVersion} this draft was based on no longer exists.`,
            {
              errorOrigin: "frontend",
              errorCategory: "product_state",
              operation: "skill_draft.resume",
            },
            "WARNING",
          );
        };
        try {
          const saved = await utils.skills.byName.fetch({
            projectId,
            name: skillName,
            version: baseVersion,
          });
          if (saved.id !== draft.baseVersionId) {
            discardMissingBase();
            return;
          }
          selected.store
            .getState()
            .actions.syncLabels(
              saved.labels.filter((label) => label !== SKILL_LATEST_LABEL),
            );
          selected.store.getState().actions.syncTags(saved.tags);
        } catch (error) {
          if (
            error instanceof TRPCClientError &&
            error.data?.code === "NOT_FOUND"
          ) {
            discardMissingBase();
            return;
          }
          showErrorToast(
            "Could not resume draft",
            error instanceof Error ? error.message : "Please try again.",
            classifyTrpcToastError(error, "skill_draft.resume"),
          );
          return;
        }
      }
      setDraft(selected);
      await router.push({
        pathname: router.pathname,
        query: {
          projectId,
          skillName,
          version: selected.store.getState().baseVersion,
          draft: "true",
        },
      });
    }
    return (
      <SkillEditorForInitialValue
        headerProps={headerProps}
        key={isDraft ? "draft" : skill.data.id}
        projectId={projectId ?? ""}
        initialValue={initialValue}
        store={isDraft ? (draftStore ?? undefined) : undefined}
        view={
          isDraft
            ? {
                kind: "draft",
                onDiscard: async () => {
                  const baseVersion = draftStore!.getState().baseVersion;
                  draft?.discard();
                  setDraft(null);
                  await router.push({
                    pathname: router.pathname,
                    query: { projectId, skillName, version: baseVersion },
                  });
                },
              }
            : {
                kind: "version",
                skillId: skill.data.id,
                hasDraft: draftStore !== null,
                onEdit: selectDraft,
              }
        }
        canCreate={canCreate}
        metadataOptions={{
          labels: [
            ...new Set([
              "production",
              ...skill.data.labels,
              ...history.data.pages.flatMap((page) =>
                page.items.flatMap((item) => item.labels),
              ),
            ]),
          ],
          tags: filterOptions.data?.tags.map((tag) => tag.value) ?? [],
        }}
        history={{
          kind: "versions",
          versions: history.data.pages.flatMap((page) => page.items),
          hasMore: history.hasNextPage,
          isLoadingMore: history.isFetchingNextPage,
          loadMoreError: history.isFetchNextPageError,
          onLoadMore: () => history.fetchNextPage(),
          selectedVersion: skill.data.version,
          draftStore,
          onSelectDraft: selectDraft,
          onSelect: async (selectedVersion) => {
            await router.push({
              pathname: router.pathname,
              query: {
                projectId,
                skillName,
                version: selectedVersion,
                ...(router.query.tab === "usage" ||
                router.query.tab === "linked-traces" ||
                router.query.tab === "metrics"
                  ? {
                      tab: router.query.tab,
                      ...(router.query.dateRange
                        ? { dateRange: router.query.dateRange }
                        : {}),
                    }
                  : {}),
              },
            });
          },
        }}
        onCreated={async (created) => {
          draft?.discard();
          await Promise.all([
            utils.skills.all.invalidate(),
            utils.skills.filterOptions.invalidate(),
            utils.skills.byName.invalidate(),
            utils.skills.skillVersions.invalidate(),
          ]);
          await router.push({
            pathname: router.pathname,
            query: {
              projectId,
              skillName: created.name,
              version: created.version,
            },
          });
          setDraft(null);
        }}
      />
    );
  }

  return <Page headerProps={headerProps}>{content}</Page>;
}

function SkillEditorForInitialValue({
  initialValue,
  store: draftStore,
  ...props
}: Omit<ComponentProps<typeof SkillEditor>, "store"> & {
  store?: SkillEditorStore;
  initialValue: SkillEditorInitialValue;
}) {
  const [store] = useState(
    () => draftStore ?? createSkillEditorStore(initialValue),
  );

  return <SkillEditor {...props} store={store} />;
}
