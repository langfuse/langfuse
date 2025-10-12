import Header from "@/src/components/layouts/header";
import ContainerPage from "@/src/components/layouts/container-page";
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
import { showChat } from "@/src/features/support-chat/PlainChat";
import { api } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";
import { type RouterOutput } from "@/src/utils/types";
import { Check } from "lucide-react";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { StringParam, useQueryParam } from "use-query-params";
import { useTranslation } from "react-i18next";

// Multi-step setup process
// 1. Create Organization: /setup
// 2. Invite Members: /organization/:orgId/setup
// 3. Create Project: /organization/:orgId/setup?step=create-project
// 4. Setup Tracing: /project/:projectId/setup
export function SetupPage() {
  const { t } = useTranslation();
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
    <ContainerPage
      headerProps={{
        title: t("onboarding.setup.title"),
        help: {
          description: t("onboarding.setup.helpDescription"),
        },
        ...(stepInt === 1 && {
          breadcrumb: [
            {
              name: t("common.navigation.organizations"),
              href: "/",
            },
          ],
        }),
      }}
    >
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
              {t("onboarding.setup.steps.createOrganization")}
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
              {t("onboarding.setup.steps.inviteMembers")}
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
              {t("onboarding.setup.steps.createProject")}
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
              {t("onboarding.setup.steps.setupTracing")}
              {stepInt === 4 && <Check className="ml-1 inline-block h-3 w-3" />}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <Card className="p-3">
        {
          // 1. Create Org
          stepInt === 1 && (
            <div>
              <Header title={t("onboarding.setup.organization.title")} />
              <p className="mb-4 text-sm text-muted-foreground">
                {t("onboarding.setup.organization.description")}
              </p>
              <NewOrganizationForm
                onSuccess={(orgId) => {
                  router.push(inviteMembersRoute(orgId));
                }}
              />
            </div>
          )
        }
        {
          // 2. Invite Members
          stepInt === 2 && organization && (
            <div className="flex flex-col gap-10">
              <div>
                <Header title={t("onboarding.setup.members.title")} />
                <p className="mb-4 text-sm text-muted-foreground">
                  {t("onboarding.setup.members.description")}
                </p>
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
            <div>
              <Header title={t("onboarding.setup.project.title")} />
              <p className="mb-4 text-sm text-muted-foreground">
                {t("onboarding.setup.project.description")}
              </p>
              <NewProjectForm
                orgId={organization.id}
                onSuccess={(projectId) =>
                  router.push(setupTracingRoute(projectId))
                }
              />
            </div>
          )
        }
        {
          // 4. Setup Tracing
          stepInt === 4 && project && organization && (
            <TracingSetup
              projectId={project.id}
              hasAnyTrace={hasAnyTrace ?? false}
            />
          )
        }
      </Card>

      {stepInt === 2 && organization && (
        <Button
          className="mt-4 self-start"
          data-testid="btn-skip-add-members"
          onClick={() => router.push(createProjectRoute(organization.id))}
        >
          {t("onboarding.setup.buttons.next")}
        </Button>
      )}
      {
        // 4. Setup Tracing
        stepInt === 4 && project && (
          <Button
            className="mt-4 self-start"
            onClick={() => router.push(`/project/${project.id}`)}
            variant={hasAnyTrace ? "default" : "secondary"}
          >
            {hasAnyTrace
              ? t("onboarding.setup.buttons.openDashboard")
              : t("onboarding.setup.buttons.skipForNow")}
          </Button>
        )
      }
    </ContainerPage>
  );
}

const TracingSetup = ({
  projectId,
  hasAnyTrace,
}: {
  projectId: string;
  hasAnyTrace?: boolean;
}) => {
  const { t } = useTranslation();
  const [apiKeys, setApiKeys] = useState<
    RouterOutput["projectApiKeys"]["create"] | null
  >(null);
  const utils = api.useUtils();
  const mutCreateApiKey = api.projectApiKeys.create.useMutation({
    onSuccess: (data) => {
      utils.projectApiKeys.invalidate();
      setApiKeys(data);
      showChat();
    },
  });

  const createApiKey = async () => {
    try {
      await mutCreateApiKey.mutateAsync({ projectId });
    } catch (error) {
      console.error("Error creating API key:", error);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <Header title={t("onboarding.setup.apiKeys.title")} />
        <p className="mb-4 text-sm text-muted-foreground">
          {t("onboarding.setup.apiKeys.description")}
        </p>
        {apiKeys ? (
          <ApiKeyRender generatedKeys={apiKeys} scope={"project"} />
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              {t("onboarding.setup.apiKeys.needToCreate")}
            </p>
            <Button
              onClick={createApiKey}
              loading={mutCreateApiKey.isPending}
              className="self-start"
            >
              {t("onboarding.setup.apiKeys.createButton")}
            </Button>
          </div>
        )}
      </div>

      <div>
        <Header
          title={t("onboarding.setup.tracing.title")}
          status={hasAnyTrace ? "active" : "pending"}
        />
        <p className="mb-4 text-sm text-muted-foreground">
          {t("onboarding.setup.tracing.description")}
        </p>
        <QuickstartExamples
          secretKey={apiKeys?.secretKey}
          publicKey={apiKeys?.publicKey}
        />
      </div>
    </div>
  );
};
