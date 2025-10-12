import Header from "@/src/components/layouts/header";
import { ApiKeyList } from "@/src/features/public-api/components/ApiKeyList";
import { DeleteProjectButton } from "@/src/features/projects/components/DeleteProjectButton";
import { HostNameProject } from "@/src/features/projects/components/HostNameProject";
import RenameProject from "@/src/features/projects/components/RenameProject";
import { Button } from "@/src/components/ui/button";
import Link from "next/link";
import { LlmApiKeyList } from "@/src/features/public-api/components/LLMApiKeyList";
import { PagedSettingsContainer } from "@/src/components/PagedSettingsContainer";
import { useQueryProject } from "@/src/features/projects/hooks";
import { MembershipInvitesPage } from "@/src/features/rbac/components/MembershipInvitesPage";
import { MembersTable } from "@/src/features/rbac/components/MembersTable";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { PostHogLogo } from "@/src/components/PosthogLogo";
import { Card } from "@/src/components/ui/card";
import { ScoreConfigSettings } from "@/src/features/scores/components/ScoreConfigSettings";
import { TransferProjectButton } from "@/src/features/projects/components/TransferProjectButton";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { useRouter } from "next/router";
import { SettingsDangerZone } from "@/src/components/SettingsDangerZone";
import { ActionButton } from "@/src/components/ActionButton";
import { BatchExportsSettingsPage } from "@/src/features/batch-exports/components/BatchExportsSettingsPage";
import { AuditLogsSettingsPage } from "@/src/ee/features/audit-log-viewer/AuditLogsSettingsPage";
import { ModelsSettings } from "@/src/features/models/components/ModelSettings";
import ConfigureRetention from "@/src/features/projects/components/ConfigureRetention";
import ContainerPage from "@/src/components/layouts/container-page";
import ProtectedLabelsSettings from "@/src/features/prompts/components/ProtectedLabelsSettings";
import { Slack } from "lucide-react";
import { useTranslation } from "react-i18next";

type ProjectSettingsPage = {
  title: string;
  slug: string;
  show?: boolean | (() => boolean);
  cmdKKeywords?: string[];
} & ({ content: React.ReactNode } | { href: string });

export function useProjectSettingsPages(): ProjectSettingsPage[] {
  const router = useRouter();
  const { t } = useTranslation();
  const { project, organization } = useQueryProject();
  const showBillingSettings = useHasEntitlement("cloud-billing");
  const showRetentionSettings = useHasEntitlement("data-retention");
  const showProtectedLabelsSettings = useHasEntitlement(
    "prompt-protected-labels",
  );

  if (!project || !organization || !router.query.projectId) {
    return [];
  }

  return getProjectSettingsPages({
    project,
    organization,
    showBillingSettings,
    showRetentionSettings,
    showLLMConnectionsSettings: true,
    showProtectedLabelsSettings,
    t,
  });
}

export const getProjectSettingsPages = ({
  project,
  organization,
  showBillingSettings,
  showRetentionSettings,
  showLLMConnectionsSettings,
  showProtectedLabelsSettings,
  t,
}: {
  project: { id: string; name: string; metadata: Record<string, unknown> };
  organization: { id: string; name: string; metadata: Record<string, unknown> };
  showBillingSettings: boolean;
  showRetentionSettings: boolean;
  showLLMConnectionsSettings: boolean;
  showProtectedLabelsSettings: boolean;
  t: (key: string) => string;
}): ProjectSettingsPage[] => [
  {
    title: t("project.settings.general.title"),
    slug: "index",
    cmdKKeywords: ["name", "id", "delete", "transfer", "ownership"],
    content: (
      <div className="flex flex-col gap-6">
        <HostNameProject />
        <RenameProject />
        {showRetentionSettings && <ConfigureRetention />}
        <div>
          <Header title={t("project.settings.general.debugInformation")} />
          <JSONView
            title={t("project.settings.general.metadata")}
            json={{
              project: {
                name: project.name,
                id: project.id,
                ...project.metadata,
              },
              org: {
                name: organization.name,
                id: organization.id,
                ...organization.metadata,
              },
            }}
          />
        </div>
        <SettingsDangerZone
          items={[
            {
              title: t("project.settings.general.transferOwnership"),
              description: t(
                "project.settings.general.transferOwnershipDescription",
              ),
              button: <TransferProjectButton />,
            },
            {
              title: t("project.settings.general.deleteThisProject"),
              description: t(
                "project.settings.general.deleteProjectDescription",
              ),
              button: <DeleteProjectButton />,
            },
          ]}
        />
      </div>
    ),
  },
  {
    title: t("project.settings.apiKeys.title"),
    slug: "api-keys",
    cmdKKeywords: ["auth", "public key", "secret key"],
    content: (
      <div className="flex flex-col gap-6">
        <ApiKeyList entityId={project.id} scope="project" />
      </div>
    ),
  },
  {
    title: t("project.settings.llmConnections.title"),
    slug: "llm-connections",
    cmdKKeywords: [
      "llm",
      "provider",
      "openai",
      "anthropic",
      "azure",
      "playground",
      "evaluation",
      "endpoint",
      "api",
    ],
    content: (
      <div className="flex flex-col gap-6">
        <LlmApiKeyList projectId={project.id} />
      </div>
    ),
    show: showLLMConnectionsSettings,
  },
  {
    title: t("project.settings.models.title"),
    slug: "models",
    cmdKKeywords: ["cost", "token"],
    content: <ModelsSettings projectId={project.id} />,
  },
  {
    title: t("project.settings.protectedPromptLabels.title"),
    slug: "protected-prompt-labels",
    cmdKKeywords: ["prompt", "label", "protect", "lock"],
    content: <ProtectedLabelsSettings projectId={project.id} />,
    show: showProtectedLabelsSettings,
  },
  {
    title: t("project.settings.scores.title"),
    slug: "scores",
    cmdKKeywords: ["config"],
    content: <ScoreConfigSettings projectId={project.id} />,
  },
  {
    title: t("project.settings.members.title"),
    slug: "members",
    cmdKKeywords: ["invite", "user"],
    content: (
      <div>
        <Header title={t("project.settings.members.projectMembers")} />
        <MembersTable
          orgId={organization.id}
          project={{ id: project.id, name: project.name }}
          showSettingsCard
        />
        <div>
          <MembershipInvitesPage
            orgId={organization.id}
            projectId={project.id}
          />
        </div>
      </div>
    ),
  },
  {
    title: t("project.settings.integrations.title"),
    slug: "integrations",
    cmdKKeywords: ["posthog"],
    content: <Integrations projectId={project.id} />,
  },
  {
    title: t("project.settings.exports.title"),
    slug: "exports",
    cmdKKeywords: ["csv", "download", "json", "batch"],
    content: <BatchExportsSettingsPage projectId={project.id} />,
  },
  {
    title: t("project.settings.auditLogs.title"),
    slug: "audit-logs",
    cmdKKeywords: ["trail"],
    content: <AuditLogsSettingsPage projectId={project.id} />,
  },
  {
    title: t("project.settings.billing.title"),
    slug: "billing",
    href: `/organization/${organization.id}/settings/billing`,
    show: showBillingSettings,
  },
  {
    title: t("organization.settings.title"),
    slug: "organization",
    href: `/organization/${organization.id}/settings`,
  },
];

export default function SettingsPage() {
  const { t } = useTranslation();
  const { project, organization } = useQueryProject();
  const router = useRouter();
  const pages = useProjectSettingsPages();

  if (!project || !organization) return null;

  return (
    <ContainerPage
      headerProps={{
        title: t("project.settings.title"),
      }}
    >
      <PagedSettingsContainer
        activeSlug={router.query.page as string | undefined}
        pages={pages}
      />
    </ContainerPage>
  );
}

const Integrations = (props: { projectId: string }) => {
  const { t } = useTranslation();
  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "integrations:CRUD",
  });

  const allowBlobStorageIntegration = useHasEntitlement(
    "scheduled-blob-exports",
  );

  return (
    <div>
      <Header title={t("project.settings.integrations.title")} />
      <div className="space-y-6">
        <Card className="p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <PostHogLogo className="mb-4 w-40 text-foreground" />
          <p className="mb-4 text-sm text-primary">
            {t("project.settings.integrations.posthog.description")}
          </p>
          <div className="flex items-center gap-2">
            <ActionButton
              variant="secondary"
              hasAccess={hasAccess}
              href={`/project/${props.projectId}/settings/integrations/posthog`}
            >
              {t("project.settings.integrations.configure")}
            </ActionButton>
            <Button asChild variant="ghost">
              <Link
                href="https://langfuse.com/integrations/analytics/posthog"
                target="_blank"
              >
                {t("project.settings.integrations.integrationDocs")}
              </Link>
            </Button>
          </div>
        </Card>

        <Card className="p-3">
          <span className="font-semibold">
            {t("project.settings.integrations.blobStorage.title")}
          </span>
          <p className="mb-4 text-sm text-primary">
            {t("project.settings.integrations.blobStorage.description")}
          </p>
          <div className="flex items-center gap-2">
            <ActionButton
              variant="secondary"
              hasAccess={hasAccess}
              hasEntitlement={allowBlobStorageIntegration}
              href={`/project/${props.projectId}/settings/integrations/blobstorage`}
            >
              {t("project.settings.integrations.configure")}
            </ActionButton>
            <Button asChild variant="ghost">
              <Link
                href="https://langfuse.com/docs/query-traces#blob-storage"
                target="_blank"
              >
                {t("project.settings.integrations.integrationDocs")}
              </Link>
            </Button>
          </div>
        </Card>

        <Card className="p-3">
          <div className="mb-4 flex items-center gap-2">
            <Slack className="h-5 w-5 text-foreground" />
            <span className="font-semibold">
              {t("project.settings.integrations.slack.title")}
            </span>
          </div>
          <p className="mb-4 text-sm text-primary">
            {t("project.settings.integrations.slack.description")}
          </p>
          <div className="flex items-center gap-2">
            <ActionButton
              variant="secondary"
              hasAccess={hasAccess}
              href={`/project/${props.projectId}/settings/integrations/slack`}
            >
              {t("project.settings.integrations.configure")}
            </ActionButton>
          </div>
        </Card>
      </div>
    </div>
  );
};
