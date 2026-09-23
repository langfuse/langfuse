import { type ComponentProps, useState } from "react";
import { useRouter } from "next/router";
import { useStore } from "zustand";
import Page from "@/src/components/layouts/page";
import { Skeleton } from "@/src/components/ui/skeleton";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  NEW_SKILL_INITIAL_VALUE,
  SkillEditor,
  toSkillEditorInitialValue,
} from "@/src/features/skills/components/SkillEditor";
import {
  createSkillEditorStore,
  type SkillEditorInitialValue,
} from "@/src/features/skills/components/skillEditorStore";
import { parseSkillFrontmatterMetadata } from "@/src/features/skills/utils/parseSkillFrontmatterMetadata";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { api } from "@/src/utils/api";

export function NewSkillPage() {
  const router = useRouter();
  const projectId = useProjectIdFromURL();
  const canCreate = useHasProjectAccess({
    projectId: projectId ?? "",
    scope: "skills:CUD",
  });
  const utils = api.useUtils();
  const catalog = api.skills.all.useQuery(
    { projectId: projectId ?? "", page: 1, limit: 100 },
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
    <Page
      headerProps={{
        title: metadata?.name.trim() ? metadata.name : "Create skill",
        subtitle: metadata?.description,
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
    >
      <SkillEditor
        projectId={projectId ?? ""}
        store={store}
        canCreate={canCreate}
        history={{ kind: "new" }}
        metadataOptions={getMetadataOptions(catalog.data?.data ?? [])}
        onCreated={async (created) => {
          await utils.skills.all.invalidate();
          await router.push(
            `/project/${projectId}/skills/${encodeURIComponent(created.name)}?version=${created.version}`,
          );
        }}
      />
    </Page>
  );
}

export function ExistingSkillPage() {
  const router = useRouter();
  const projectId = useProjectIdFromURL();
  const skillName =
    typeof router.query.skillName === "string" ? router.query.skillName : "";
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
  const catalog = api.skills.all.useQuery(
    {
      projectId: projectId ?? "",
      page: 1,
      limit: 100,
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

  let content = <div className="p-6 text-sm">Skill version not found.</div>;
  if (error) {
    content = <div className="ph-no-capture p-6 text-sm">{error.message}</div>;
  } else if (skill.isPending || history.isPending) {
    content = (
      <div className="grid gap-3 p-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  } else if (skill.data && history.data) {
    content = (
      <SkillEditorForInitialValue
        key={skill.data.id}
        projectId={projectId ?? ""}
        initialValue={toSkillEditorInitialValue({
          ...skill.data,
          files: skill.data.files.map((file) => ({
            path: file.path,
            contentType: file.contentType,
            source: { fileId: file.id, blobId: file.blobId },
          })),
        })}
        canCreate={canCreate}
        metadataOptions={getMetadataOptions(catalog.data?.data ?? [])}
        history={{
          kind: "versions",
          versions: history.data.pages.flatMap((page) => page.items),
          hasMore: history.hasNextPage,
          isLoadingMore: history.isFetchingNextPage,
          loadMoreError: history.isFetchNextPageError,
          onLoadMore: () => history.fetchNextPage(),
          selectedVersion: skill.data.version,
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
        }}
      />
    );
  }

  return (
    <Page
      headerProps={{
        title: skill.data?.name ?? skillName,
        subtitle: skill.data?.description,
        help: skill.data
          ? {
              description:
                "The skill name and description are parsed from the frontmatter in SKILL.md.",
            }
          : undefined,
        breadcrumb: [
          { name: "Skills", href: `/project/${projectId}/skills` },
          { name: "Editor" },
        ],
      }}
    >
      {content}
    </Page>
  );
}

function SkillEditorForInitialValue({
  initialValue,
  ...props
}: Omit<ComponentProps<typeof SkillEditor>, "store"> & {
  initialValue: SkillEditorInitialValue;
}) {
  const [store] = useState(() => createSkillEditorStore(initialValue));

  return <SkillEditor {...props} store={store} />;
}

function getMetadataOptions(
  skills: Array<{ labels: string[]; tags: string[] }>,
) {
  return {
    labels: [...new Set(skills.flatMap((skill) => skill.labels))],
    tags: [...new Set(skills.flatMap((skill) => skill.tags))],
  };
}
