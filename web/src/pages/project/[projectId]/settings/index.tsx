import Header from "@/src/components/layouts/header";
import { ApiKeyList } from "@/src/features/public-api/components/ApiKeyList";
import { DeleteProjectDialogController } from "@/src/features/projects/components/DeleteProjectDialogController";
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
import { MixpanelLogo } from "@/src/components/MixpanelLogo";
import { Card } from "@/src/components/ui/card";
import { TransferProjectDialogController } from "@/src/features/projects/components/TransferProjectDialogController";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { useRouter } from "next/router";
import { SettingsDangerZone } from "@/src/components/SettingsDangerZone";
import { ActionButton } from "@/src/components/ActionButton";
import { BatchExportsSettingsPage } from "@/src/features/batch-exports/components/BatchExportsSettingsPage";
import { BatchActionsSettingsPage } from "@/src/features/batch-actions/components/BatchActionsSettingsPage";
import { AuditLogsSettingsPage } from "@/src/ee/features/audit-log-viewer/AuditLogsSettingsPage";
import { ModelsSettings } from "@/src/features/models/components/ModelSettings";
import ConfigureRetention from "@/src/features/projects/components/ConfigureRetention";
import ContainerPage from "@/src/components/layouts/container-page";
import ProtectedLabelsSettings from "@/src/features/prompts/components/ProtectedLabelsSettings";
import { SiSlack } from "react-icons/si";
import { ScoreConfigSettings } from "@/src/features/score-configs/components/ScoreConfigSettings";
import { env } from "@/src/env.mjs";
import { PersonalNotificationSettings } from "@/src/features/notifications/components/PersonalNotificationSettings";
import { ProjectNotificationChannels } from "@/src/features/notifications/components/ProjectNotificationChannels";
import { WebCalloutIntegrationCard } from "@/src/features/web-callouts/components/WebCalloutSettingsPage";
import { DeveloperToolsSettings } from "@/src/features/developer-tools/components/DeveloperToolsSettings";
import { useV4UpgradeUiFlag } from "@/src/features/v4-migration/useV4UpgradeUiEnabled";
import { useTranslations } from "next-intl";

type ProjectSettingsPage = {
  title: string;
  slug: string;
  show?: boolean | (() => boolean);
  cmdKKeywords?: string[];
} & ({ content: React.ReactNode } | { href: string });

const defaultProjectSettingsLabels = {
  general: "General",
  apiKeys: "API Keys",
  developerTools: "MCP & CLI",
  llmConnections: "LLM Connections",
  modelDefinitions: "Model Definitions",
  protectedPromptLabels: "Protected Prompt Labels",
  scoreConfigs: "Scores Configs",
  members: "Members",
  integrations: "Integrations",
  exports: "Exports",
  batchActions: "Batch Actions",
  auditLogs: "Audit Logs",
  notifications: "Notifications",
  billing: "Billing",
  organizationSettings: "Organization Settings",
  v4Migration: "v4 Migration",
  debugInformation: "Debug Information",
  metadata: "Metadata",
  projectMembers: "Project Members",
  dangerZone: "Danger Zone",
  transferTitle: "Transfer ownership",
  transferDescription:
    "Transfer this project to another organization where you have the ability to create projects.",
  transferButton: "Transfer Project",
  deleteTitle: "Delete this project",
  deleteDescription:
    "Once you delete a project, there is no going back. Please be certain.",
  deleteButton: "Delete Project",
};

export function useProjectSettingsPages(): ProjectSettingsPage[] {
  const t = useTranslations("workspace.projectSettings");
  const router = useRouter();
  const { project, organization } = useQueryProject();
  const showBillingSettings = useHasEntitlement("cloud-billing");
  const showRetentionSettings = useHasEntitlement("data-retention");
  const showProtectedLabelsSettings = useHasEntitlement(
    "prompt-protected-labels",
  );
  const showProjectNotificationChannels = useHasProjectAccess({
    projectId: project?.id,
    scope: "automations:CUD",
  });
  const showScoreConfigSettings = useHasProjectAccess({
    projectId: project?.id,
    scope: "scoreConfigs:read",
  });
  const showV4Migration = useV4UpgradeUiFlag();
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
    showProjectNotificationChannels,
    showScoreConfigSettings,
    showV4Migration,
    labels: {
      general: t("general"),
      apiKeys: t("apiKeys"),
      developerTools: t("developerTools"),
      llmConnections: t("llmConnections"),
      modelDefinitions: t("modelDefinitions"),
      protectedPromptLabels: t("protectedPromptLabels"),
      scoreConfigs: t("scoreConfigs"),
      members: t("members"),
      integrations: t("integrations"),
      exports: t("exports"),
      batchActions: t("batchActions"),
      auditLogs: t("auditLogs"),
      notifications: t("notifications"),
      billing: t("billing"),
      organizationSettings: t("organizationSettings"),
      v4Migration: t("v4Migration"),
      debugInformation: t("debugInformation"),
      metadata: t("metadata"),
      projectMembers: t("projectMembers"),
      dangerZone: t("dangerZone"),
      transferTitle: t("transferTitle"),
      transferDescription: t("transferDescription"),
      transferButton: t("transferButton"),
      deleteTitle: t("deleteTitle"),
      deleteDescription: t("deleteDescription"),
      deleteButton: t("deleteButton"),
    },
  });
}

export const getProjectSettingsPages = ({
  project,
  organization,
  showBillingSettings,
  showRetentionSettings,
  showLLMConnectionsSettings,
  showProtectedLabelsSettings,
  showProjectNotificationChannels,
  showScoreConfigSettings,
  showV4Migration,
  labels = defaultProjectSettingsLabels,
}: {
  project: { id: string; name: string; metadata: Record<string, unknown> };
  organization: { id: string; name: string; metadata: Record<string, unknown> };
  showBillingSettings: boolean;
  showRetentionSettings: boolean;
  showLLMConnectionsSettings: boolean;
  showProtectedLabelsSettings: boolean;
  showProjectNotificationChannels: boolean;
  showScoreConfigSettings: boolean;
  showV4Migration: boolean;
  labels?: typeof defaultProjectSettingsLabels;
}): ProjectSettingsPage[] => [
  {
    title: labels.general,
    slug: "index",
    cmdKKeywords: ["name", "id", "delete", "transfer", "ownership"],
    content: (
      <div className="flex flex-col gap-6">
        <HostNameProject />
        <RenameProject />
        {showRetentionSettings && <ConfigureRetention />}
        <div>
          <Header title={labels.debugInformation} />
          <JSONView
            title={labels.metadata}
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
              ...(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION && {
                cloudRegion: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
              }),
            }}
          />
        </div>
        <SettingsDangerZone
          title={labels.dangerZone}
          items={[
            {
              title: labels.transferTitle,
              description: labels.transferDescription,
              button: (
                <TransferProjectDialogController
                  project={project}
                  organization={organization}
                >
                  {({ disabled, openDialog }) => (
                    <Button
                      variant="destructive-secondary"
                      disabled={disabled !== undefined}
                      onClick={openDialog}
                    >
                      {labels.transferButton}
                    </Button>
                  )}
                </TransferProjectDialogController>
              ),
            },
            {
              title: labels.deleteTitle,
              description: labels.deleteDescription,
              button: (
                <DeleteProjectDialogController>
                  {({ hasAccess, Trigger }) => (
                    <Trigger asChild>
                      <Button
                        variant="destructive-secondary"
                        disabled={!hasAccess}
                      >
                        {labels.deleteButton}
                      </Button>
                    </Trigger>
                  )}
                </DeleteProjectDialogController>
              ),
            },
          ]}
        />
      </div>
    ),
  },
  {
    title: labels.apiKeys,
    slug: "api-keys",
    cmdKKeywords: ["auth", "public key", "secret key"],
    content: (
      <div className="flex flex-col gap-6">
        <ApiKeyList entityId={project.id} scope="project" />
      </div>
    ),
  },
  {
    title: labels.developerTools,
    slug: "developer-tools",
    cmdKKeywords: [
      "mcp",
      "cli",
      "skill",
      "agent",
      "model context protocol",
      "command line",
      "claude code",
      "cursor",
    ],
    content: <DeveloperToolsSettings projectId={project.id} />,
  },
  {
    title: labels.llmConnections,
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
    title: labels.modelDefinitions,
    slug: "models",
    cmdKKeywords: ["cost", "token"],
    content: <ModelsSettings projectId={project.id} />,
  },
  {
    title: labels.protectedPromptLabels,
    slug: "protected-prompt-labels",
    cmdKKeywords: ["prompt", "label", "protect", "lock"],
    content: <ProtectedLabelsSettings projectId={project.id} />,
    show: showProtectedLabelsSettings,
  },
  {
    title: labels.scoreConfigs,
    slug: "scores",
    cmdKKeywords: ["config"],
    content: <ScoreConfigSettings projectId={project.id} />,
    show: showScoreConfigSettings,
  },
  {
    title: labels.members,
    slug: "members",
    cmdKKeywords: ["invite", "user"],
    content: (
      <div>
        <Header title={labels.projectMembers} />
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
    title: labels.integrations,
    slug: "integrations",
    cmdKKeywords: ["posthog", "mixpanel", "analytics", "callback", "webhook"],
    content: <Integrations projectId={project.id} />,
  },
  {
    title: labels.exports,
    slug: "exports",
    cmdKKeywords: ["csv", "download", "json", "batch"],
    content: <BatchExportsSettingsPage projectId={project.id} />,
  },
  {
    title: labels.batchActions,
    slug: "batch-actions",
    cmdKKeywords: ["bulk", "batch", "action", "dataset", "delete"],
    content: <BatchActionsSettingsPage projectId={project.id} />,
  },
  {
    title: labels.auditLogs,
    slug: "audit-logs",
    cmdKKeywords: ["trail"],
    content: <AuditLogsSettingsPage projectId={project.id} />,
  },
  {
    title: labels.notifications,
    slug: "notifications",
    cmdKKeywords: ["inbox", "email", "mention", "alert", "slack", "webhook"],
    content: (
      <div className="flex flex-col gap-6">
        <PersonalNotificationSettings />
        {showProjectNotificationChannels && (
          <ProjectNotificationChannels projectId={project.id} />
        )}
      </div>
    ),
  },
  {
    title: labels.billing,
    slug: "billing",
    href: `/organization/${organization.id}/settings/billing`,
    show: showBillingSettings,
  },
  {
    title: labels.organizationSettings,
    slug: "organization",
    href: `/organization/${organization.id}/settings`,
  },
  {
    title: labels.v4Migration,
    slug: "v4-migration",
    href: "/v4-migration",
    show: showV4Migration,
  },
];

export default function SettingsPage() {
  const t = useTranslations("workspace.projectSettings");
  const { project, organization } = useQueryProject();
  const router = useRouter();
  const pages = useProjectSettingsPages();

  if (!project || !organization) return null;

  return (
    <ContainerPage
      headerProps={{
        title: t("title"),
      }}
    >
      <PagedSettingsContainer
        activeSlug={router.query.page as string | undefined}
        pages={pages}
        selectPlaceholder={t("selectPlaceholder")}
      />
    </ContainerPage>
  );
}

const Integrations = (props: { projectId: string }) => {
  const t = useTranslations("settingsEnterprise.integrationsOverview");
  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "integrations:CRUD",
  });

  const allowBlobStorageIntegration = useHasEntitlement(
    "scheduled-blob-exports",
  );

  return (
    <div>
      <Header title={t("title")} />
      <div className="space-y-6">
        <Card className="p-3">
          {}
          <PostHogLogo className="text-foreground mb-4 w-40" />
          <p className="text-primary mb-4 text-sm">{t("posthogDescription")}</p>
          <div className="flex items-center gap-2">
            <ActionButton
              variant="secondary"
              hasAccess={hasAccess}
              href={`/project/${props.projectId}/settings/integrations/posthog`}
            >
              {t("configure")}
            </ActionButton>
            <Button asChild variant="ghost">
              <Link
                href="https://langfuse.com/integrations/analytics/posthog"
                target="_blank"
              >
                {t("docs")}
              </Link>
            </Button>
          </div>
        </Card>

        <Card className="p-3">
          <MixpanelLogo className="text-foreground mb-4 w-20" />
          <p className="text-primary mb-4 text-sm">
            {t("mixpanelDescription")}
          </p>
          <div className="flex items-center gap-2">
            <ActionButton
              variant="secondary"
              hasAccess={hasAccess}
              href={`/project/${props.projectId}/settings/integrations/mixpanel`}
            >
              {t("configure")}
            </ActionButton>
            <Button asChild variant="ghost">
              <Link
                href="https://langfuse.com/integrations/analytics/mixpanel"
                target="_blank"
              >
                {t("docs")}
              </Link>
            </Button>
          </div>
        </Card>

        <Card className="p-3">
          <span className="font-bold">{t("blobStorage")}</span>
          <p className="text-primary mb-4 text-sm">
            {t("blobStorageDescription")}
          </p>
          <div className="flex items-center gap-2">
            <ActionButton
              variant="secondary"
              hasAccess={hasAccess}
              hasEntitlement={allowBlobStorageIntegration}
              href={`/project/${props.projectId}/settings/integrations/blobstorage`}
            >
              {t("configure")}
            </ActionButton>
            <Button asChild variant="ghost">
              <Link
                href="https://langfuse.com/docs/query-traces#blob-storage"
                target="_blank"
              >
                {t("docs")}
              </Link>
            </Button>
          </div>
        </Card>

        <Card className="p-3">
          <div className="mb-4 flex items-center gap-2">
            <SiSlack className="text-foreground h-5 w-5" />
            <span className="font-bold">Slack</span>
          </div>
          <p className="text-primary mb-4 text-sm">{t("slackDescription")}</p>
          <div className="flex items-center gap-2">
            <ActionButton
              variant="secondary"
              hasAccess={hasAccess}
              href={`/project/${props.projectId}/settings/integrations/slack`}
            >
              {t("configure")}
            </ActionButton>
          </div>
        </Card>

        <WebCalloutIntegrationCard
          projectId={props.projectId}
          hasAccess={hasAccess}
        />
      </div>
    </div>
  );
};
