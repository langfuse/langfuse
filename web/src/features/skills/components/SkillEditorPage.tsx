import { type ComponentProps, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useStore } from "zustand";
import Page from "@/src/components/layouts/page";
import { Skeleton } from "@/src/components/ui/skeleton";
import { showErrorToast } from "@/src/features/notifications";
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
  const [store] = useState(() =>
    createSkillEditorStore(NEW_SKILL_INITIAL_VALUE),
  );
  const skillMarkdown = useStore(
    store,
    (state) => state.files["SKILL.md"]?.content ?? "",
  );
  const metadata = parseSkillFrontmatterMetadata(skillMarkdown);

  return (
    <SkillEditor
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
          await router.push(`/project/${projectId}/skills`);
        },
      }}
      history={{ kind: "new" }}
      metadataOptions={{
        labels: ["production"],
        tags: filterOptions.data?.tags.map((tag) => tag.value) ?? [],
      }}
      onCreated={async (created) => {
        await Promise.all([
          utils.skills.all.invalidate(),
          utils.skills.filterOptions.invalidate(),
        ]);
        await router.push(
          `/project/${projectId}/skills/${encodeURIComponent(created.name)}?version=${created.version}`,
        );
      }}
    />
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
  const router = useRouter();
  const [draftStore, setDraftStore] = useState<SkillEditorStore | null>(null);
  const isDraft = draftStore !== null && router.query.draft === "true";
  const requestedVersion =
    typeof router.query.version === "string"
      ? Number(router.query.version)
      : undefined;
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
      const draft = draftStore ?? createSkillEditorStore(initialValue);
      const baseVersion = draft.getState().baseVersion;
      if (draftStore && baseVersion !== null) {
        try {
          const saved = await utils.skills.byName.fetch({
            projectId,
            name: skillName,
            version: baseVersion,
          });
          draft
            .getState()
            .actions.syncLabels(
              saved.labels.filter((label) => label !== SKILL_LATEST_LABEL),
            );
          draft.getState().actions.syncTags(saved.tags);
        } catch (error) {
          showErrorToast(
            "Could not resume draft",
            error instanceof Error ? error.message : "Please try again.",
            classifyTrpcToastError(error, "skill_draft.resume"),
          );
          return;
        }
      }
      setDraftStore(draft);
      await router.push({
        pathname: router.pathname,
        query: {
          projectId,
          skillName,
          version: draft.getState().baseVersion,
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
                  setDraftStore(null);
                  await router.push({
                    pathname: router.pathname,
                    query: { projectId, skillName, version: baseVersion },
                  });
                },
              }
            : {
                kind: "version",
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
              query: { projectId, skillName, version: selectedVersion },
            });
          },
        }}
        onCreated={async (created) => {
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
          setDraftStore(null);
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
