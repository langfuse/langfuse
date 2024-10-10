import Header from "@/src/components/layouts/header";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/src/components/ui/breadcrumb";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { NewOrganizationForm } from "@/src/features/organizations/components/NewOrganizationForm";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { NewProjectForm } from "@/src/features/projects/components/NewProjectForm";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";
import { ApiKeyRender } from "@/src/features/public-api/components/CreateApiKeyButton";
import { QuickstartExamples } from "@/src/features/public-api/components/QuickstartExamples";
import { MembershipInvitesPage } from "@/src/features/rbac/components/MembershipInvitesPage";
import { MembersTable } from "@/src/features/rbac/components/MembersTable";
import {
  createProjectRoute,
  inviteMembersRoute,
  setupTracingRoute,
} from "@/src/features/setup/setupRoutes";
import { api } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";
import { type RouterOutput } from "@/src/utils/types";
import { Check } from "lucide-react";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import { StringParam, useQueryParam } from "use-query-params";

// Multi-step setup process
// 1. Create Organization: /setup
// 2. Invite Members: /organization/:orgId/setup
// 3. Create Project: /organization/:orgId/setup?step=create-project
// 4. Setup Tracing: /project/:projectId/setup
export function SetupPage() {
  const { project, organization } = useQueryProjectOrOrganization();
  const router = useRouter();
  const [orgStep] = useQueryParam("orgstep", StringParam); // "invite-members" | "create-project"
  const queryProjectId = router.query.projectId as string | undefined;

  // starts at 1 to align with breadcrumb
  const stepInt = !organization
    ? 1
    : project
      ? 4
      : orgStep === "create-project"
        ? 3
        : 2;

  const hasAnyTrace = api.traces.hasAny.useQuery(
    { projectId: queryProjectId as string },
    {
      enabled: queryProjectId !== undefined && stepInt === 4,
      refetchInterval: 5000,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  ).data;

  const capture = usePostHogClientCapture();
  useEffect(() => {
    if (hasAnyTrace !== undefined) {
      capture("onboarding:tracing_check_active", { active: hasAnyTrace });
    }
  }, [hasAnyTrace, capture]);

  return (
    <div className="mb-12 md:container">
      <Header
        title="Setup"
        help={{
          description:
            "Create a new organization. This will be used to manage your projects and teams.",
        }}
      />
      <Breadcrumb className="mb-3">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage
              className={cn(
                stepInt !== 1
                  ? "text-muted-foreground"
                  : "font-semibold text-foreground",
              )}
            >
              1. Create Organization
              {stepInt > 1 && <Check className="ml-1 inline-block h-3 w-3" />}
            </BreadcrumbPage>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage
              className={cn(
                stepInt !== 2
                  ? "text-muted-foreground"
                  : "font-semibold text-foreground",
              )}
            >
              2. Invite Members
              {stepInt > 2 && <Check className="ml-1 inline-block h-3 w-3" />}
            </BreadcrumbPage>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage
              className={cn(
                stepInt !== 3
                  ? "text-muted-foreground"
                  : "font-semibold text-foreground",
              )}
            >
              3. Create Project
              {stepInt > 3 && <Check className="ml-1 inline-block h-3 w-3" />}
            </BreadcrumbPage>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage
              className={cn(
                stepInt !== 4
                  ? "text-muted-foreground"
                  : "font-semibold text-foreground",
              )}
            >
              4. Setup Tracing
              {stepInt === 4 && <Check className="ml-1 inline-block h-3 w-3" />}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <Card className="p-3">
        {
          // 1. Create Org
          stepInt === 1 && (
            <NewOrganizationForm
              onSuccess={(orgId) => {
                router.push(inviteMembersRoute(orgId));
              }}
            />
          )
        }
        {
          // 2. Invite Members
          stepInt === 2 && organization && (
            <div className="flex flex-col gap-10">
              <div>
                <Header title="Organization Members" level="h3" />
                <MembersTable orgId={organization.id} />
              </div>
              <div>
                <MembershipInvitesPage orgId={organization.id} />
              </div>
            </div>
          )
        }
        {
          // 3. Create Project
          stepInt === 3 && organization && (
            <NewProjectForm
              orgId={organization.id}
              onSuccess={(projectId) =>
                router.push(setupTracingRoute(projectId))
              }
            />
          )
        }
        {
          // 4. Setup Tracing
          stepInt === 4 && project && organization && (
            <div className="space-y-8">
              <div>
                <Header title="API Keys" level="h3" />
                <TracingSetup
                  projectId={project.id}
                  hasAnyTrace={hasAnyTrace ?? false}
                />
              </div>
            </div>
          )
        }
      </Card>
      {stepInt === 2 && organization && (
        <Button
          className="mt-4"
          data-testid="btn-skip-add-members"
          onClick={() => router.push(createProjectRoute(organization.id))}
        >
          Next
        </Button>
      )}
      {
        // 4. Setup Tracing
        stepInt === 4 && project && (
          <Button
            className="mt-4"
            onClick={() => router.push(`/project/${project.id}`)}
            variant={hasAnyTrace ? "default" : "secondary"}
          >
            {hasAnyTrace ? "Open Dashboard" : "Skip for now"}
          </Button>
        )
      }
    </div>
  );
}

const TracingSetup = ({
  projectId,
  hasAnyTrace,
}: {
  projectId: string;
  hasAnyTrace?: boolean;
}) => {
  const [apiKeys, setApiKeys] = useState<
    RouterOutput["apiKeys"]["create"] | null
  >(null);
  const utils = api.useUtils();
  const mutCreateApiKey = api.apiKeys.create.useMutation({
    onSuccess: () => utils.apiKeys.invalidate(),
  });
  const isLoadingRef = useRef(false);

  useEffect(() => {
    const createApiKey = async () => {
      if (projectId && !isLoadingRef.current && !apiKeys) {
        isLoadingRef.current = true;
        try {
          const apiKey = await mutCreateApiKey.mutateAsync({ projectId });
          setApiKeys(apiKey);
        } catch (error) {
          console.error("Error creating API key:", error);
        } finally {
          isLoadingRef.current = false;
        }
      }
    };
    if (!apiKeys) {
      createApiKey();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <ApiKeyRender generatedKeys={apiKeys ?? undefined} />
      </div>
      {apiKeys && (
        <div>
          <Header
            title="Setup Tracing"
            level="h3"
            status={hasAnyTrace ? "active" : "pending"}
          />
          <QuickstartExamples
            secretKey={apiKeys.secretKey}
            publicKey={apiKeys.publicKey}
          />
        </div>
      )}
    </div>
  );
};
