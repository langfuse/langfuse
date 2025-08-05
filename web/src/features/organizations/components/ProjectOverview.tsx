import {
  BookOpen,
  LockIcon,
  MessageSquareText,
  Settings,
  Users,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import Header from "@/src/components/layouts/header";
import { Button } from "@/src/components/ui/button";
import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { StringParam, useQueryParams } from "use-query-params";
import { Input } from "@/src/components/ui/input";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { env } from "@/src/env.mjs";
import { Divider } from "@tremor/react";
import { Fragment } from "react";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import {
  createOrganizationRoute,
  createProjectRoute,
} from "@/src/features/setup/setupRoutes";
import { isCloudPlan, planLabels } from "@langfuse/shared";
import ContainerPage from "@/src/components/layouts/container-page";
import { type User } from "next-auth";

const OrganizationProjectTiles = ({
  org,
  search,
}: {
  org: User["organizations"][number];
  search?: string;
}) => {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {org.projects
        .filter(
          (p) => !search || p.name.toLowerCase().includes(search.toLowerCase()),
        )
        .map((project) => (
          <Card key={project.id}>
            <CardHeader>
              <CardTitle className="truncate text-base">
                {project.name}
              </CardTitle>
            </CardHeader>
            {!project.deletedAt ? (
              <CardFooter className="gap-2">
                <Button asChild variant="secondary">
                  <Link href={`/project/${project.id}`}>
                    プロジェクトに移動
                  </Link>
                </Button>
                <Button asChild variant="ghost">
                  <Link href={`/project/${project.id}/settings`}>
                    <Settings size={16} />
                  </Link>
                </Button>
              </CardFooter>
            ) : (
              <CardContent>
                <CardDescription>プロジェクトを削除中です</CardDescription>
              </CardContent>
            )}
          </Card>
        ))}
    </div>
  );
};

const DemoOrganizationTile = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Langfuseデモを試す</CardTitle>
      </CardHeader>
      <CardContent>
        Langfuseドキュメントに基づいた質問応答チャットボットを構築しました。これと対話して、Langfuseでトレースを確認してください。
      </CardContent>
      <CardFooter>
        <Button asChild variant="secondary">
          <Link href={`/project/${env.NEXT_PUBLIC_DEMO_PROJECT_ID}`}>
            デモプロジェクトを表示
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
};

const OrganizationActionButtons = ({
  orgId,
  primaryButtonVariant = "default",
}: {
  orgId: string;
  primaryButtonVariant?: "default" | "secondary";
}) => {
  const membersViewAccess = useHasOrganizationAccess({
    organizationId: orgId,
    scope: "organizationMembers:read",
  });
  const createProjectAccess = useHasOrganizationAccess({
    organizationId: orgId,
    scope: "projects:create",
  });

  return (
    <>
      <Button asChild variant="ghost">
        <Link href={`/organization/${orgId}/settings`}>
          <Settings size={14} />
        </Link>
      </Button>
      {membersViewAccess && (
        <Button asChild variant="ghost">
          <Link href={`/organization/${orgId}/settings/members`}>
            <Users size={14} />
          </Link>
        </Button>
      )}
      {createProjectAccess ? (
        <Button asChild variant={primaryButtonVariant}>
          <Link href={createProjectRoute(orgId)}>
            <PlusIcon className="mr-2 h-4 w-4" aria-hidden="true" />
            新しいプロジェクト
          </Link>
        </Button>
      ) : (
        <Button disabled variant={primaryButtonVariant}>
          <LockIcon className="mr-2 h-4 w-4" aria-hidden="true" />
          New project
        </Button>
      )}
    </>
  );
};

const SingleOrganizationPage = ({
  orgId,
  search,
}: {
  orgId: string;
  search?: string;
}) => {
  const session = useSession();
  const org = session.data?.user?.organizations.find((o) => o.id === orgId);

  if (!org) {
    return null;
  }

  const isDemoOrg =
    env.NEXT_PUBLIC_DEMO_ORG_ID === orgId &&
    org.projects.some((p) => p.id === env.NEXT_PUBLIC_DEMO_PROJECT_ID);

  if (isDemoOrg) {
    return (
      <ContainerPage
        headerProps={{
          title: "デモ組織",
        }}
      >
        <DemoOrganizationTile />
      </ContainerPage>
    );
  }

  return (
    <ContainerPage
      headerProps={{
        title: org?.name ?? "組織",
        actionButtonsRight: <OrganizationActionButtons orgId={orgId} />,
      }}
    >
      <OrganizationProjectTiles org={org} search={search} />
    </ContainerPage>
  );
};

const SingleOrganizationProjectOverviewTile = ({
  orgId,
  search,
}: {
  orgId: string;
  search?: string;
}) => {
  const session = useSession();
  const org = session.data?.user?.organizations.find((o) => o.id === orgId);

  if (!org) {
    return null;
  }

  const isDemoOrg =
    env.NEXT_PUBLIC_DEMO_ORG_ID === orgId &&
    org.projects.some((p) => p.id === env.NEXT_PUBLIC_DEMO_PROJECT_ID);

  if (isDemoOrg) {
    return (
      <div key={orgId}>
        <DemoOrganizationTile />
      </div>
    );
  }

  return (
    <div key={orgId} className="mb-10">
      <Header
        title={org.name}
        className="truncate"
        status={orgId === env.NEXT_PUBLIC_DEMO_ORG_ID ? "Demo Org" : undefined}
        label={
          isCloudPlan(org.plan)
            ? {
                text: planLabels[org.plan],
                href: `/organization/${org.id}/settings/billing`,
              }
            : undefined
        }
        actionButtons={
          <OrganizationActionButtons
            orgId={orgId}
            primaryButtonVariant="secondary"
          />
        }
      />
      <OrganizationProjectTiles org={org} search={search} />
    </div>
  );
};

export const OrganizationProjectOverview = () => {
  const router = useRouter();
  const queryOrgId = router.query.organizationId;
  const session = useSession();
  const canCreateOrg = session.data?.user?.canCreateOrganizations;
  const organizations = session.data?.user?.organizations;
  const [{ search }, setQueryParams] = useQueryParams({ search: StringParam });

  if (organizations === undefined) {
    return "読み込み中...";
  }

  const showOnboarding =
    organizations.filter((org) => org.id !== env.NEXT_PUBLIC_DEMO_ORG_ID)
      .length === 0 && !queryOrgId;

  if (queryOrgId) {
    const org = organizations.find((org) => org.id === queryOrgId);

    if (!org) {
      return null;
    }

    return (
      <SingleOrganizationPage orgId={org.id} search={search ?? undefined} />
    );
  }

  return (
    <ContainerPage
      headerProps={{
        title: "組織",
        help: {
          description:
            "組織はプロジェクトへのアクセスを管理するために使用されます。各組織は複数のプロジェクトと、異なる役割を持つチームメンバーを持つことができます。",
          href: "https://langfuse.com/docs/rbac",
        },
        breadcrumb: [
          {
            name: "組織",
            href: "/",
          },
        ],
        actionButtonsRight: (
          <>
            <Input
              className="mr-1 w-36 lg:w-56"
              placeholder="プロジェクトを検索"
              onChange={(e) => setQueryParams({ search: e.target.value })}
            />
            {canCreateOrg && (
              <Button data-testid="create-organization-btn" asChild>
                <Link href={createOrganizationRoute}>
                  <PlusIcon className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  新しい組織
                </Link>
              </Button>
            )}
          </>
        ),
      }}
    >
      {showOnboarding && <Onboarding />}
      {organizations
        .sort((a, b) => {
          // sort demo org to the bottom
          const isDemoA = env.NEXT_PUBLIC_DEMO_ORG_ID === a.id;
          const isDemoB = env.NEXT_PUBLIC_DEMO_ORG_ID === b.id;
          if (isDemoA) return 1;
          if (isDemoB) return -1;
          return 0;
        })
        .map((org) => (
          <Fragment key={org.id}>
            {!queryOrgId && org.id === env.NEXT_PUBLIC_DEMO_ORG_ID && (
              <Divider />
            )}
            <SingleOrganizationProjectOverviewTile
              orgId={org.id}
              search={search ?? undefined}
            />
          </Fragment>
        ))}
    </ContainerPage>
  );
};

const Onboarding = () => {
  const session = useSession();
  const canCreateOrgs = session.data?.user?.canCreateOrganizations;
  return (
    <Card className="mt-5">
      <CardHeader>
        <CardTitle data-testid="create-new-project-title">はじめる</CardTitle>
      </CardHeader>
      <CardContent>
        <CardDescription>
          {canCreateOrgs
            ? "組織を作成して開始しましょう。または、組織の管理者に招待してもらうこともできます。"
            : "Langfuseを開始するには、組織に招待される必要があります。"}
        </CardDescription>
      </CardContent>
      <CardFooter className="flex gap-4">
        {canCreateOrgs && (
          <Button data-testid="create-project-btn" asChild>
            <Link href={createOrganizationRoute}>
              <PlusIcon className="mr-2 h-4 w-4" aria-hidden="true" />
              New Organization
            </Link>
          </Button>
        )}
        <Button variant="secondary" asChild>
          <Link href="https://langfuse.com/docs" target="_blank">
            <BookOpen className="mr-2 h-4 w-4" aria-hidden="true" />
            ドキュメント
          </Link>
        </Button>
        <Button variant="secondary" asChild>
          <Link href="https://langfuse.com/docs/ask-ai" target="_blank">
            <MessageSquareText className="mr-2 h-4 w-4" aria-hidden="true" />
            AIに質問
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
};
