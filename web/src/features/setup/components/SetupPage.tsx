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
    <ContainerPage
      headerProps={{
        title: "セットアップ",
        help: {
          description:
            "新しい組織を作成します。プロジェクトやチームを管理するために使用されます。",
        },
        ...(stepInt === 1 && {
          breadcrumb: [
            {
              name: "組織",
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
              1. 組織を作成
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
              2. メンバーを招待
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
              3. プロジェクトを作成
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
              4. トレーシングを設定
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
              <Header title="新しい組織" />
              <p className="mb-4 text-sm text-muted-foreground">
                組織はプロジェクトやチームを管理するために使用されます。
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
                <Header title="組織メンバー" />
                <p className="mb-4 text-sm text-muted-foreground">
                  組織にメンバーを招待して、プロジェクトで共同作業を行います。
                  メンバーは後からいつでも追加できます。
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
              <Header title="新しいプロジェクト" />
              <p className="mb-4 text-sm text-muted-foreground">
                プロジェクトは、トレース、データセット、評価、プロンプトをグループ化するために使用されます。
                複数の環境は、プロジェクト内のタグで分離するのが最適です。
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
          次へ
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
            {hasAnyTrace ? "ダッシュボードを開く" : "今はスキップ"}
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
        <Header title="APIキー" />
        <p className="mb-4 text-sm text-muted-foreground">
          これらのキーはAPIリクエストの認証に使用されます。
          プロジェクト設定で後からさらにキーを作成できます。
        </p>
        {apiKeys ? (
          <ApiKeyRender generatedKeys={apiKeys} scope={"project"} />
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              アプリケーションのトレーシングを開始するには、APIキーを作成する必要があります。
            </p>
            <Button
              onClick={createApiKey}
              loading={mutCreateApiKey.isLoading}
              className="self-start"
            >
              APIキーを作成
            </Button>
          </div>
        )}
      </div>

      <div>
        <Header
          title="トレーシングの設定"
          status={hasAnyTrace ? "active" : "pending"}
        />
        <p className="mb-4 text-sm text-muted-foreground">
          トレーシングは、LLM呼び出しを追跡して分析するために使用されます。
          このステップはスキップして、後でトレーシングを設定することもできます。
        </p>
        <QuickstartExamples
          secretKey={apiKeys?.secretKey}
          publicKey={apiKeys?.publicKey}
        />
      </div>
    </div>
  );
};
