import { Button } from "@/src/components/ui/button";
import Link from "next/link";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";
import { api } from "@/src/utils/api";
import { setupTracingRoute } from "@/src/features/setup/setupRoutes";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { LockIcon } from "lucide-react";
import { useRouter } from "next/router";

const SetupTracingButton = () => {
  const { project } = useQueryProjectOrOrganization();

  const router = useRouter();
  const queryProjectId = router.query.projectId as string | undefined;

  const { data: hasAnyTrace, isLoading } = api.traces.hasAny.useQuery(
    { projectId: queryProjectId as string },
    {
      enabled: queryProjectId !== undefined,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

  const hasAccess = useHasProjectAccess({
    projectId: project?.id,
    scope: "apiKeys:create",
  });

  if (isLoading || hasAnyTrace || !project) {
    return null;
  }

  if (!hasAccess)
    return (
      <Button disabled>
        <LockIcon className="-ml-0.5 mr-2 h-4 w-4" aria-hidden="true" />
        Configure Tracing
      </Button>
    );

  return (
    <Link href={setupTracingRoute(project.id)}>
      <Button>Configure Tracing</Button>
    </Link>
  );
};

export default SetupTracingButton;
