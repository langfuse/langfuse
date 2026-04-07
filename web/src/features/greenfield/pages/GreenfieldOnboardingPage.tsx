import Page from "@/src/components/layouts/page";
import { useQueryProject } from "@/src/features/projects/hooks";
import {
  GreenfieldOnboardingView,
  greenfieldReferenceGaps,
} from "../components/GreenfieldOnboardingView";

export default function GreenfieldOnboardingPage() {
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
        projectId={project.id}
        organizationId={organization?.id}
      />
    </Page>
  );
}
