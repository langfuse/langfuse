import { useAppShellVariant } from "@/src/features/app-shell";
import { OrganizationProjectOverview } from "@/src/features/organizations/components/OrganizationProjectOverview";
import { ProjectsOverviewPage } from "@/src/features/projects-overview";

export default function OrganizationOverview() {
  const { variant } = useAppShellVariant();
  return variant === "next" ? (
    <ProjectsOverviewPage />
  ) : (
    <OrganizationProjectOverview />
  );
}
