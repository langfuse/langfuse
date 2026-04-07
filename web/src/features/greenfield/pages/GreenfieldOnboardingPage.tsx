import { useSession } from "next-auth/react";
import Page from "@/src/components/layouts/page";
import { useQueryProject } from "@/src/features/projects/hooks";
import {
  GreenfieldOnboardingView,
  greenfieldReferenceGaps,
} from "../components/GreenfieldOnboardingView";

function getFirstName(name?: string | null) {
  if (!name) return "there";
  return name.trim().split(/\s+/)[0] || "there";
}

export default function GreenfieldOnboardingPage() {
  const { data: session } = useSession();
  const { project, organization } = useQueryProject();

  if (!project) {
    return null;
  }

  return (
    <Page
      scrollable
      withPadding
      headerProps={{
        title: "Greenfield",
        help: {
          description: (
            <div className="space-y-2">
              <p>
                Source-inspired onboarding scaffold for the new greenfield
                experience.
              </p>
              <ul role="list" className="space-y-1">
                {greenfieldReferenceGaps.map((gap) => (
                  <li key={gap} className="text-sm text-pretty">
                    {gap}
                  </li>
                ))}
              </ul>
            </div>
          ),
        },
      }}
    >
      <GreenfieldOnboardingView
        firstName={getFirstName(session?.user.name)}
        projectId={project.id}
        organizationId={organization?.id}
      />
    </Page>
  );
}
