import Link from "next/link";
import { useRouter } from "next/router";
import { NumberParam, StringParam, useQueryParam } from "use-query-params";
import {
  TabsBar,
  TabsBarList,
  TabsBarContent,
  TabsBarTrigger,
} from "@/src/components/ui/tabs-bar";
import { Badge } from "@/src/components/ui/badge";
import { CodeView, JSONView } from "@/src/components/ui/CodeJsonViewer";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { api } from "@/src/utils/api";
import { extractVariables } from "@langfuse/shared";
import {
  getSkillTabs,
  SKILL_TABS,
} from "@/src/features/navigation/utils/skill-tabs";
import { SkillHistoryNode } from "./skill-history";
import { MoreVertical, Plus } from "lucide-react";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { Button } from "@/src/components/ui/button";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useMemo, useState } from "react";
import { DuplicateSkillButton } from "@/src/features/skills/components/duplicate-skill";
import Page from "@/src/components/layouts/page";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/src/components/ui/dropdown-menu";
import { DeleteSkillVersion } from "@/src/features/skills/components/delete-skill-version";
import { TagSkillDetailsPopover } from "@/src/features/tag/components/TagSkillDetailsPopover";
import { SetSkillVersionLabels } from "@/src/features/skills/components/SetSkillVersionLabels";
import { Command, CommandInput } from "@/src/components/ui/command";
import { SkillVariableListPreview } from "@/src/features/skills/components/SkillVariableListPreview";
import { createBreadcrumbItems } from "@/src/features/folders/utils";

export const SkillDetail = ({
  skillName: skillNameProp,
}: { skillName?: string } = {}) => {
  const projectId = useProjectIdFromURL();
  const capture = usePostHogClientCapture();
  const router = useRouter();

  const skillName =
    skillNameProp ||
    (router.query.skillName
      ? decodeURIComponent(router.query.skillName as string)
      : "");
  const [currentSkillVersion, setCurrentSkillVersion] = useQueryParam(
    "version",
    NumberParam,
  );
  const [currentSkillLabel, setCurrentSkillLabel] = useQueryParam(
    "label",
    StringParam,
  );
  const [isLabelPopoverOpen, setIsLabelPopoverOpen] = useState(false);
  const hasCommentReadAccess = useHasProjectAccess({
    projectId,
    scope: "comments:read",
  });
  const skillHistoryInput = useMemo(
    () => ({
      name: skillName,
      projectId: projectId as string, // Typecast as query is enabled only when projectId is present
      includeCommentCounts: hasCommentReadAccess,
    }),
    [hasCommentReadAccess, projectId, skillName],
  );
  const skillHistory = api.skills.allVersions.useQuery(skillHistoryInput, {
    enabled: Boolean(projectId),
  });
  const skill = currentSkillVersion
    ? skillHistory.data?.skillVersions.find(
        (skill) => skill.version === currentSkillVersion,
      )
    : currentSkillLabel
      ? skillHistory.data?.skillVersions.find((skill) =>
          skill.labels.includes(currentSkillLabel),
        )
      : skillHistory.data?.skillVersions[0];

  const allTags = (
    api.skills.filterOptions.useQuery(
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

  const commentCounts = skillHistory.data?.commentCounts;

  if (!skillHistory.data || !skill) {
    return <div className="p-3">Loading...</div>;
  }

  const extractedVariables = extractVariables(skill.instructions ?? "");

  const segments = skillName.split("/").filter((s) => s.trim());
  const folderPath = segments.length > 1 ? segments.slice(0, -1).join("/") : "";
  const breadcrumbItems = folderPath ? createBreadcrumbItems(folderPath) : [];

  return (
    <Page
      headerProps={{
        title: skill.name,
        titleTooltip:
          "Skill names cannot be changed. Instead, duplicate this skill to a different name.",
        help: {
          description:
            "You can use this skill within your application through the Langfuse SDKs and integrations.",
          href: "https://langfuse.com/docs",
        },
        breadcrumb: [
          {
            name: "Skills",
            href: `/project/${projectId}/skills/`,
          },
          ...breadcrumbItems.map((item) => ({
            name: item.name,
            href: `/project/${projectId}/skills?folder=${encodeURIComponent(item.folderPath)}`,
          })),
        ],
        tabsProps: {
          tabs: getSkillTabs(projectId as string, skillName as string),
          activeTab: SKILL_TABS.VERSIONS,
        },
        actionButtonsLeft: (
          <TagSkillDetailsPopover
            tags={skill.tags}
            availableTags={allTags}
            projectId={projectId as string}
            skillName={skill.name}
            includeCommentCounts={skillHistoryInput.includeCommentCounts}
          />
        ),
        actionButtonsRight: (
          <>
            {projectId && (
              <DuplicateSkillButton
                skillId={skill.id}
                projectId={projectId}
                skillName={skill.name}
                skillVersion={skill.version}
              />
            )}
            <DetailPageNav
              key="nav"
              currentId={skillName}
              path={(entry) => `/project/${projectId}/skills/${entry.id}`}
              listKey="skills"
            />
          </>
        ),
      }}
    >
      <div className="grid flex-1 grid-cols-3 gap-4 overflow-hidden px-3 md:grid-cols-4">
        <Command className="flex flex-col gap-2 overflow-y-auto rounded-none border-r pr-3 font-medium focus:ring-0 focus:outline-hidden focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-hidden data-focus:ring-0">
          <div className="mt-3 flex items-center justify-between">
            <CommandInput
              showBorder={false}
              placeholder="Search..."
              className="text-muted-foreground h-fit border-none py-0 text-sm font-light focus:ring-0"
            />

            <Button
              onClick={() => {
                capture("skills:update_form_open");
              }}
              className="h-6 w-6 shrink-0 px-1 lg:h-8 lg:w-fit lg:px-3"
            >
              <Link
                className="grid w-full place-items-center md:grid-flow-col"
                href={`/project/${projectId}/skills/new?skillId=${encodeURIComponent(skill.id)}`}
              >
                <Plus className="h-4 w-4 md:mr-2" />
                <span className="hidden lg:inline">New version</span>
              </Link>
            </Button>
          </div>
          <div className="flex flex-col overflow-y-auto">
            <SkillHistoryNode
              skills={skillHistory.data.skillVersions}
              currentSkillVersion={skill.version}
              setCurrentSkillVersion={(version) => {
                setCurrentSkillVersion(version);
                setCurrentSkillLabel(null);
              }}
              commentCounts={commentCounts}
            />
          </div>
        </Command>
        <div className="col-span-2 mt-3 flex max-h-full min-h-0 flex-col md:col-span-3">
          <div className="flex flex-col items-start gap-2">
            <div className="grid w-full min-w-0 grid-cols-[auto_auto] items-center justify-between">
              <div className="flex max-w-full min-w-0 shrink flex-col">
                <div className="flex max-w-full min-w-0 flex-wrap items-start gap-1">
                  <SetSkillVersionLabels
                    title={
                      <div
                        className="contents cursor-default!"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Badge
                          variant="outline"
                          className="mr-1 h-6 text-nowrap"
                        >
                          # {skill.version}
                        </Badge>
                        <span className="mb-0 line-clamp-2 min-w-0 text-lg font-medium break-all md:break-normal md:wrap-break-word">
                          {skill.commitMessage ?? skill.name}
                        </span>
                      </div>
                    }
                    skillLabels={skill.labels}
                    skill={skill}
                    isOpen={isLabelPopoverOpen}
                    setIsOpen={setIsLabelPopoverOpen}
                  />
                </div>

                <div className="min-h-1 flex-1" />
              </div>
              <div className="flex h-full flex-wrap content-start items-start justify-end gap-1 lg:flex-nowrap">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="flex flex-col *:w-full *:justify-start"
                  >
                    <DropdownMenuItem asChild>
                      <DeleteSkillVersion
                        skillVersionId={skill.id}
                        version={skill.version}
                        countVersions={skillHistory.data.totalCount}
                      />
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
          {skill.description ? (
            <p className="text-muted-foreground mt-2 text-sm">
              {skill.description}
            </p>
          ) : null}
          {skill.allowedTools.length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-1">
              <span className="text-muted-foreground text-xs">
                Allowed tools:
              </span>
              {skill.allowedTools.map((tool) => (
                <Badge key={tool} variant="secondary">
                  {tool}
                </Badge>
              ))}
            </div>
          ) : null}
          <TabsBar defaultValue="instructions" className="mt-2 min-h-0">
            <TabsBarList className="max-w-full min-w-0 justify-start overflow-x-auto">
              <TabsBarTrigger value="instructions">Instructions</TabsBarTrigger>
              <TabsBarTrigger value="metadata">Metadata</TabsBarTrigger>
            </TabsBarList>
            <TabsBarContent
              value="instructions"
              className="mt-0 flex max-h-full min-h-0 flex-1 overflow-hidden"
            >
              <div className="mb-2 flex max-h-full min-h-0 w-full flex-col gap-2 overflow-y-auto">
                <CodeView content={skill.instructions} title="Instructions" />
                <SkillVariableListPreview variables={extractedVariables} />
              </div>
            </TabsBarContent>
            <TabsBarContent
              value="metadata"
              className="mt-0 flex max-h-full min-h-0 flex-1 overflow-hidden"
            >
              <div className="flex max-h-full min-h-0 w-full flex-col overflow-y-auto pb-4">
                <JSONView
                  json={skill.metadata}
                  title="Metadata"
                  className="pb-2"
                />
              </div>
            </TabsBarContent>
          </TabsBar>
        </div>
      </div>
    </Page>
  );
};
