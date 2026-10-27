import Header from "@/src/components/layouts/header";
import { ApiKeyList } from "@/src/features/public-api/components/ApiKeyList";
import { DeleteProjectDialogController } from "@/src/features/projects/components/DeleteProjectDialogController";
import { HostNameProject } from "@/src/features/projects/components/HostNameProject";
import RenameProject from "@/src/features/projects/components/RenameProject";
import { Button } from "@/src/components/ui/button";
import Link from "next/link";
import { LlmApiKeyList } from "@/src/features/public-api/components/LlmApiKeyList";
import { PagedSettingsContainer } from "@/src/components/PagedSettingsContainer";
import { useQueryProject } from "@/src/features/projects/hooks";
import { ConnectedMembershipInvitesSettingsTable } from "@/src/features/rbac/components/MembershipInvitesSettingsTable/ConnectedMembershipInvitesSettingsTable";
import { ConnectedMembersSettingsTable } from "@/src/features/rbac/components/MembersSettingsTable/ConnectedMembersSettingsTable";
import {
  useHasProjectAccess,
  useHasOrganizationAccess,
} from "@/src/features/rbac";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { PostHogLogo } from "@/src/components/PostHogLogo";
import { MixpanelLogo } from "@/src/components/MixpanelLogo";
import { Card } from "@/src/components/ui/card";
import { TransferProjectDialogController } from "@/src/features/projects/components/TransferProjectDialogController";
import { useHasEntitlement } from "@/src/features/entitlements";
import { useRouter } from "next/router";
import { SettingsDangerZone } from "@/src/components/SettingsDangerZone";
import { ActionButton } from "@/src/components/ActionButton";
import { Webhook } from "@langfuse/icons";
import { BatchExportsSettingsPage } from "@/src/features/batch-exports";
import { BatchActionsSettingsPage } from "@/src/features/batch-actions";
import { AuditLogsSettingsPage } from "@/src/ee/features/audit-log-viewer";
import { ModelsSettings } from "@/src/features/models";
import ConfigureRetention from "@/src/features/projects/components/ConfigureRetention";
import ContainerPage from "@/src/components/layouts/ContainerPage";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import { ProtectedLabelsSettings } from "@/src/features/prompts";
import { SiSlack } from "@langfuse/icons/si";
import { ScoreConfigSettings } from "@/src/features/score-configs";
import { env } from "@/src/env.mjs";
import { PersonalNotificationSettings } from "@/src/features/notifications/components/PersonalNotificationSettings";
import { ProjectNotificationChannels } from "@/src/features/notifications/components/ProjectNotificationChannels";
import useSessionStorage from "@/src/components/useSessionStorage";
import { useWebCallouts } from "@/src/features/web-callouts";
import { DeveloperToolsSettings } from "@/src/features/developer-tools";
import { useV4UpgradeUiFlag } from "@/src/features/v4-migration/useV4UpgradeUiEnabled";
import { api } from "@/src/utils/api";
import {
  StatusBadge,
  type Status,
} from "@/src/components/ui/StatusBadge/StatusBadge";
import { usePostHogIntegration } from "@/src/features/posthog-integration/usePostHogIntegration";
import { useMixpanelIntegration } from "@/src/features/mixpanel-integration/useMixpanelIntegration";
import { useBlobStorageIntegration } from "@/src/features/blobstorage-integration/useBlobStorageIntegration";
import { useExternalMediaStorage } from "@/src/features/external-media-storage/useExternalMediaStorage";
import { useSlackIntegration } from "@/src/features/slack/useSlackIntegration";

type ProjectSettingsPageEntry = {
  title: string;
  slug: string;
  show?: boolean | (() => boolean);
  cmdKKeywords?: string[];
} & ({ content: React.ReactNode } | { href: string });

export function useProjectSettingsPages(): ProjectSettingsPageEntry[] {
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
  });
}

const getProjectSettingsPages = ({
  project,
  organization,
  showBillingSettings,
  showRetentionSettings,
  showLLMConnectionsSettings,
  showProtectedLabelsSettings,
  showProjectNotificationChannels,
  showScoreConfigSettings,
  showV4Migration,
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
}): ProjectSettingsPageEntry[] => [
  {
    title: "General",
    slug: "index",
    cmdKKeywords: ["name", "id", "delete", "transfer", "ownership"],
    content: (
      <div className="flex flex-col gap-6">
        <HostNameProject />
        <RenameProject />
        {showRetentionSettings && <ConfigureRetention />}
        <div>
          <Header title="Debug Information" />
          <Card className="mb-4 p-3">
            <JSONView
              title="Metadata"
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
              borderless
            />
          </Card>
        </div>
        <SettingsDangerZone
          items={[
            {
              title: "Transfer ownership",
              description:
                "Transfer this project to another organization where you have the ability to create projects.",
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
                      Transfer Project
                    </Button>
                  )}
                </TransferProjectDialogController>
              ),
            },
            {
              title: "Delete this project",
              description:
                "Once you delete a project, there is no going back. Deletion time scales with project size and can take multiple days for very large projects.",
              button: (
                <DeleteProjectDialogController>
                  {({ hasAccess, openDialog }) => (
                    <Button
                      variant="destructive-secondary"
                      disabled={!hasAccess}
                      onClick={openDialog}
                    >
                      Delete Project
                    </Button>
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
    title: "API Keys",
    slug: "api-keys",
    cmdKKeywords: ["auth", "public key", "secret key"],
    content: (
      <div className="flex flex-col gap-6">
        <ApiKeyList entityId={project.id} scope="project" />
      </div>
    ),
  },
  {
    title: "MCP & CLI",
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
    title: "LLM Connections",
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
        <LlmApiKeyList
          projectId={project.id}
          projectName={project.name}
          organizationId={organization.id}
          organizationName={organization.name}
        />
      </div>
    ),
    show: showLLMConnectionsSettings,
  },
  {
    title: "Model Definitions",
    slug: "models",
    cmdKKeywords: ["cost", "token"],
    content: <ModelsSettings projectId={project.id} />,
  },
  {
    title: "Protected Labels",
    slug: "protected-prompt-labels",
    cmdKKeywords: ["prompt", "skill", "label", "protect", "lock"],
    content: <ProtectedLabelsSettings projectId={project.id} />,
    show: showProtectedLabelsSettings,
  },
  {
    title: "Scores Configs",
    slug: "scores",
    cmdKKeywords: ["config"],
    content: <ScoreConfigSettings projectId={project.id} />,
    show: showScoreConfigSettings,
  },
  {
    title: "Members",
    slug: "members",
    cmdKKeywords: ["invite", "user"],
    content: (
      <ProjectMembersSettings
        orgId={organization.id}
        project={{ id: project.id, name: project.name }}
      />
    ),
  },
  {
    title: "Integrations",
    slug: "integrations",
    cmdKKeywords: ["posthog", "mixpanel", "analytics", "callback", "webhook"],
    content: <Integrations projectId={project.id} />,
  },
  {
    title: "Exports",
    slug: "exports",
    cmdKKeywords: ["csv", "download", "json", "batch"],
    content: <BatchExportsSettingsPage projectId={project.id} />,
  },
  {
    title: "Batch Actions",
    slug: "batch-actions",
    cmdKKeywords: ["bulk", "batch", "action", "dataset", "delete"],
    content: <BatchActionsSettingsPage projectId={project.id} />,
  },
  {
    title: "Audit Logs",
    slug: "audit-logs",
    cmdKKeywords: ["trail"],
    content: <AuditLogsSettingsPage projectId={project.id} />,
  },
  {
    title: "Notifications",
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
    title: "Billing",
    slug: "billing",
    href: `/organization/${organization.id}/settings/billing`,
    show: showBillingSettings,
  },
  {
    title: "Organization Settings",
    slug: "organization",
    href: `/organization/${organization.id}/settings`,
  },
  {
    title: "v4 Migration",
    slug: "v4-migration",
    href: "/v4-migration",
    show: showV4Migration,
  },
];

export default function ProjectSettingsPage() {
  const { project, organization } = useQueryProject();
  const router = useRouter();
  const pages = useProjectSettingsPages();

  if (!project || !organization) {
    return (
      <ContainerPage
        headerProps={{
          title: "Project Settings",
        }}
      >
        <NoDataOrLoading isLoading />
      </ContainerPage>
    );
  }

  return (
    <ContainerPage
      headerProps={{
        title: "Project Settings",
      }}
    >
      <PagedSettingsContainer
        activeSlug={router.query.page as string | undefined}
        pages={pages}
      />
    </ContainerPage>
  );
}

function ProjectMembersSettings({
  orgId,
  project,
}: {
  orgId: string;
  project: { id: string; name: string };
}) {
  const [invitesPagination, setInvitesPagination] = useSessionStorage(
    `projectInvites_${project.id}_pagination`,
    { pageIndex: 0, pageSize: 10 },
  );

  const hasOrgViewAccess = useHasOrganizationAccess({
    organizationId: orgId,
    scope: "organizationMembers:read",
  });

  const hasProjectViewAccess =
    useHasProjectAccess({
      projectId: project.id,
      scope: "projectMembers:read",
    }) || hasOrgViewAccess;

  const membershipInvites = api.members.allInvitesFromProject.useQuery(
    {
      projectId: project.id,
      page: invitesPagination.pageIndex,
      limit: invitesPagination.pageSize,
    },
    { enabled: hasProjectViewAccess },
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Header title="Project Members" />
        <ConnectedMembersSettingsTable orgId={orgId} project={project} />
      </div>
      {hasProjectViewAccess && (
        <div
          className={
            membershipInvites.data?.totalCount === 0 ? "hidden" : undefined
          }
        >
          <Header title="Membership Invites" />
          <ConnectedMembershipInvitesSettingsTable
            orgId={orgId}
            projectId={project.id}
            query={membershipInvites}
            paginationState={invitesPagination}
            setPaginationState={setInvitesPagination}
          />
        </div>
      )}
    </div>
  );
}

const IntegrationCardHeader = (props: {
  status: Status | undefined;
  isLoading: boolean;
  hasAccess: boolean;
  children: React.ReactNode;
}) => (
  <div className="mb-4 flex items-center justify-between gap-2">
    <div className="flex items-center gap-2">{props.children}</div>
    {props.hasAccess && !props.isLoading && (
      <StatusBadge type={props.status ?? "not_configured"} />
    )}
  </div>
);

const Integrations = (props: { projectId: string }) => {
  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "integrations:CRUD",
  });

  // Hide toast errors on integration screen. Error will appear inside integration
  const silentError = { silentAllErrors: true };
  const posthog = usePostHogIntegration(props.projectId, silentError);
  const mixpanel = useMixpanelIntegration(props.projectId, silentError);
  const blobStorage = useBlobStorageIntegration(props.projectId, silentError);
  const externalMediaStorage = useExternalMediaStorage(
    props.projectId,
    silentError,
  );
  const slack = useSlackIntegration(props.projectId, silentError);
  const webCallouts = useWebCallouts(props.projectId, silentError);

  return (
    <div>
      <Header title="Integrations" />
      <div className="space-y-6">
        <Card className="p-3">
          <IntegrationCardHeader
            status={posthog.isConfigured ? posthog.status : undefined}
            isLoading={posthog.query.isLoading}
            hasAccess={hasAccess}
          >
            <PostHogLogo className="text-foreground w-40" />
          </IntegrationCardHeader>
          <p className="text-primary mb-4 text-sm">
            We have teamed up with PostHog (OSS product analytics) to make
            Langfuse Events/Metrics available in your Posthog Dashboards.
          </p>
          <div className="flex items-center gap-2">
            <ActionButton
              variant="secondary"
              hasAccess={hasAccess}
              href={`/project/${props.projectId}/settings/integrations/posthog`}
            >
              Configure
            </ActionButton>
            <Button asChild variant="ghost">
              <Link
                href="https://langfuse.com/integrations/analytics/posthog"
                target="_blank"
              >
                Integration Docs ↗
              </Link>
            </Button>
          </div>
        </Card>

        <Card className="p-3">
          <IntegrationCardHeader
            status={mixpanel.isConfigured ? mixpanel.status : undefined}
            isLoading={mixpanel.query.isLoading}
            hasAccess={hasAccess}
          >
            <MixpanelLogo className="text-foreground w-20" />
          </IntegrationCardHeader>
          <p className="text-primary mb-4 text-sm">
            Integrate with Mixpanel to sync your Langfuse traces, generations,
            and scores for advanced product analytics and insights.
          </p>
          <div className="flex items-center gap-2">
            <ActionButton
              variant="secondary"
              hasAccess={hasAccess}
              href={`/project/${props.projectId}/settings/integrations/mixpanel`}
            >
              Configure
            </ActionButton>
            <Button asChild variant="ghost">
              <Link
                href="https://langfuse.com/integrations/analytics/mixpanel"
                target="_blank"
              >
                Integration Docs ↗
              </Link>
            </Button>
          </div>
        </Card>

        <Card className="p-3">
          <IntegrationCardHeader
            status={blobStorage.status}
            isLoading={blobStorage.query.isLoading}
            hasAccess={hasAccess}
          >
            <span className="font-bold">Blob Storage</span>
          </IntegrationCardHeader>
          <p className="text-primary mb-4 text-sm">
            Configure scheduled exports of your trace data to S3 compatible
            storages, Azure Blob Storage, or Google Cloud Storage. Set up a
            scheduled export to your own storage for data analysis or backup
            purposes.
          </p>
          <div className="flex items-center gap-2">
            <ActionButton
              variant="secondary"
              hasAccess={hasAccess}
              hasEntitlement={blobStorage.hasEntitlement}
              href={`/project/${props.projectId}/settings/integrations/blobstorage`}
            >
              Configure
            </ActionButton>
            <Button asChild variant="ghost">
              <Link
                href="https://langfuse.com/docs/query-traces#blob-storage"
                target="_blank"
              >
                Integration Docs ↗
              </Link>
            </Button>
          </div>
        </Card>

        {externalMediaStorage.isFeatureEnabled ? (
          <Card className="p-3">
            <IntegrationCardHeader
              status={externalMediaStorage.status}
              isLoading={externalMediaStorage.query.isLoading}
              hasAccess={hasAccess}
            >
              <span className="font-bold">External Media Storage</span>
            </IntegrationCardHeader>
            <p className="text-primary mb-4 text-sm">
              Resolve media referenced by s3:// URIs from your own Amazon S3 or
              S3-compatible bucket.
            </p>
            <div className="flex items-center gap-2">
              <ActionButton
                variant="secondary"
                hasAccess={hasAccess}
                href={`/project/${props.projectId}/settings/integrations/external-media-storage`}
              >
                Configure
              </ActionButton>
              <Button asChild variant="ghost">
                <Link
                  href="https://langfuse.com/docs/observability/features/multi-modality#external-s3-media"
                  target="_blank"
                >
                  Integration Docs ↗
                </Link>
              </Button>
            </div>
          </Card>
        ) : null}

        <Card className="p-3">
          <IntegrationCardHeader
            status={slack.isConfigured ? slack.status : undefined}
            isLoading={slack.query.isLoading}
            hasAccess={hasAccess}
          >
            <SiSlack size="lg" color="foreground" />
            <span className="font-bold">Slack</span>
          </IntegrationCardHeader>
          <p className="text-primary mb-4 text-sm">
            Connect a Slack workspace and create channel automations to receive
            Langfuse alerts natively in Slack.
          </p>
          <div className="flex items-center gap-2">
            <ActionButton
              variant="secondary"
              hasAccess={hasAccess}
              href={`/project/${props.projectId}/settings/integrations/slack`}
            >
              Configure
            </ActionButton>
          </div>
        </Card>

        <Card className="p-3">
          <IntegrationCardHeader
            status={webCallouts.status}
            isLoading={webCallouts.query.isLoading}
            hasAccess={hasAccess}
          >
            <Webhook size="lg" color="foreground" />
            <span className="font-bold">Web Callouts</span>
          </IntegrationCardHeader>
          <p className="text-primary mb-4 text-sm">
            Send backend callouts from trace, observation, and session detail
            views to your own application.
          </p>
          <ActionButton
            variant="secondary"
            hasAccess={hasAccess}
            href={`/project/${props.projectId}/settings/integrations/web-callouts`}
          >
            Configure
          </ActionButton>
        </Card>
      </div>
    </div>
  );
};
