import Page from "@/src/components/layouts/page";
import { useQueryProject } from "@/src/features/projects/hooks";
import { GreenfieldOnboardingView } from "../components/GreenfieldOnboardingView";

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
        title: "Home",
      }}
    >
      <GreenfieldOnboardingView
        projectId={project.id}
        organizationId={organization?.id}
      />
    </Page>
  );
}
