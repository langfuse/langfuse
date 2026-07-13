import { useRouter } from "next/router";
import { ActionButton } from "@/src/components/ActionButton";
import Page from "@/src/components/layouts/page";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { SkillTable } from "@/src/features/skills/components/skills-table";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { PlusIcon } from "lucide-react";
import { api } from "@/src/utils/api";
import { SkillsOnboarding } from "@/src/components/onboarding/SkillsOnboarding";
import { SkillDetail } from "@/src/features/skills/components/skill-detail";
import { useQueryParams, StringParam } from "use-query-params";
import React from "react";

export default function SkillsWithFolder() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const routeSegments = router.query.folder;
  const [queryParams] = useQueryParams({ folder: StringParam });
  const folderQueryParam = queryParams.folder || "";

  // Determine view type based on route segments
  const segmentsArray = Array.isArray(routeSegments) ? routeSegments : [];
  const skillNameFromRoute =
    segmentsArray.length > 0 ? segmentsArray.join("/") : "";

  const capture = usePostHogClientCapture();
  const hasCUDAccess = useHasProjectAccess({
    projectId,
    scope: "skills:CUD",
  });

  // Check if the project has any skills
  const { data: hasAnySkill, isLoading } = api.skills.hasAny.useQuery(
    { projectId },
    {
      enabled: !!projectId,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

  const showOnboarding = !isLoading && !hasAnySkill;

  // Decide what to render: detail or folder view
  if (skillNameFromRoute.length > 0) {
    return <SkillDetail skillName={skillNameFromRoute} />;
  }

  return (
    <Page
      headerProps={{
        title: "Skills",
        help: {
          description:
            "Manage and version your skills in Langfuse. Edit and update them via the UI and SDK.",
          href: "https://langfuse.com/docs",
        },
        actionButtonsRight: (
          <ActionButton
            icon={<PlusIcon className="h-4 w-4" aria-hidden="true" />}
            hasAccess={hasCUDAccess}
            href={`/project/${projectId}/skills/new${folderQueryParam ? `?folder=${encodeURIComponent(folderQueryParam)}` : ""}`}
            variant="default"
            onClick={() => {
              capture("skills:new_form_open");
            }}
          >
            New skill
          </ActionButton>
        ),
      }}
      scrollable={showOnboarding}
    >
      {/* Show onboarding screen if project has no skills */}
      {showOnboarding ? (
        <SkillsOnboarding projectId={projectId} />
      ) : (
        <SkillTable key={folderQueryParam} />
      )}
    </Page>
  );
}
