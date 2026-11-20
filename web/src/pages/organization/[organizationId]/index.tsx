import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { useAppShellVariant } from "@/src/features/app-shell/hooks/useAppShellVariant";
import { OrganizationProjectOverview } from "@/src/features/organizations/components/OrganizationProjectOverview";
import { gatewayOnlyLanding } from "@/src/features/organizations/utils/gatewayOnlyLanding";
import { ProjectsOverviewPage } from "@/src/features/projects-overview/ProjectsOverviewPage";

export default function OrganizationOverview() {
  const { variant } = useAppShellVariant();
  const session = useSession();
  const router = useRouter();
  const gatewayOnly =
    gatewayOnlyLanding(session.data, router.query.organizationId) !== undefined;

  return variant === "next" && !gatewayOnly ? (
    <ProjectsOverviewPage />
  ) : (
    <OrganizationProjectOverview />
  );
}
