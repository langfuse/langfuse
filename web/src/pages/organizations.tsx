import { useAppShellVariant } from "@/src/features/app-shell/hooks/useAppShellVariant";
import { OrganizationProjectOverview } from "@/src/features/organizations/components/OrganizationProjectOverview";
import { ProjectsOverviewPage } from "@/src/features/projects-overview/ProjectsOverviewPage";

export default function Organizations() {
  const { variant } = useAppShellVariant();
  return variant === "next" ? (
    <ProjectsOverviewPage />
  ) : (
    <OrganizationProjectOverview />
  );
}
