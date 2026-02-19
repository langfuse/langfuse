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
import { MixpanelLogo } from "@/src/components/MixpanelLogo";
import { Card } from "@/src/components/ui/card";
import { TransferProjectButton } from "@/src/features/projects/components/TransferProjectButton";
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
import { Slack } from "lucide-react";
import { ScoreConfigSettings } from "@/src/features/score-configs/components/ScoreConfigSettings";
import { env } from "@/src/env.mjs";
import { NotificationSettings } from "@/src/features/notifications/components/NotificationSettings";

type ProjectSettingsPage = {
  title: string;
  slug: string;
  show?: boolean | (() => boolean);
  cmdKKeywords?: string[];
} & ({ content: React.ReactNode } | { href: string });

export function useProjectSettingsPages(): ProjectSettingsPage[] {
  const router = useRouter();
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
  });
}

export const getProjectSettingsPages = ({
  project,
  organization,
  showBillingSettings,
  showRetentionSettings,
  showLLMConnectionsSettings,
  showProtectedLabelsSettings,
}: {
  project: { id: string; name: string; metadata: Record<string, unknown> };
  organization: { id: string; name: string; metadata: Record<string, unknown> };
  showBillingSettings: boolean;
  showRetentionSettings: boolean;
  showLLMConnectionsSettings: boolean;
  showProtectedLabelsSettings: boolean;
}): ProjectSettingsPage[] => [
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
          />
        </div>
        <SettingsDangerZone
          items={[
            {
              title: "Transfer ownership",
              description:
                "Transfer this project to another organization where you have the ability to create projects.",
              button: <TransferProjectButton />,
            },
            {
              title: "Delete this project",
              description:
                "Once you delete a project, there is no going back. Please be certain.",
              button: <DeleteProjectButton />,
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
        <LlmApiKeyList projectId={project.id} />
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
    title: "Protected Prompt Labels",
    slug: "protected-prompt-labels",
    cmdKKeywords: ["prompt", "label", "protect", "lock"],
    content: <ProtectedLabelsSettings projectId={project.id} />,
    show: showProtectedLabelsSettings,
  },
  {
    title: "Scores Configs",
    slug: "scores",
    cmdKKeywords: ["config"],
    content: <ScoreConfigSettings projectId={project.id} />,
  },
  {
    title: "Members",
    slug: "members",
    cmdKKeywords: ["invite", "user"],
    content: (
      <div>
        <Header title="Project Members" />
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
    title: "Integrations",
    slug: "integrations",
    cmdKKeywords: ["posthog", "mixpanel", "analytics"],
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
    cmdKKeywords: ["inbox", "email", "mention", "alert"],
    content: <NotificationSettings />,
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
];

export default function SettingsPage() {
  const { project, organization } = useQueryProject();
  const router = useRouter();
  const pages = useProjectSettingsPages();

  if (!project || !organization) return null;

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

const Integrations = (props: { projectId: string }) => {
  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "integrations:CRUD",
  });

  const allowBlobStorageIntegration = useHasEntitlement(
    "scheduled-blob-exports",
  );

  return (
    <div>
      <Header title="Integrations" />
      <div className="space-y-6">
        <Card className="p-3">
          {}
          <PostHogLogo className="mb-4 w-40 text-foreground" />
          <p className="mb-4 text-sm text-primary">
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
          <MixpanelLogo className="mb-4 w-20 text-foreground" />
          <p className="mb-4 text-sm text-primary">
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
          <span className="font-semibold">Blob Storage</span>
          <p className="mb-4 text-sm text-primary">
            Configure scheduled exports of your trace data to S3 compatible
            storages or Azure Blob Storage. Set up a scheduled export to your
            own storage for data analysis or backup purposes.
          </p>
          <div className="flex items-center gap-2">
            <ActionButton
              variant="secondary"
              hasAccess={hasAccess}
              hasEntitlement={allowBlobStorageIntegration}
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

        <Card className="p-3">
          <div className="mb-4 flex items-center gap-2">
            <Slack className="h-5 w-5 text-foreground" />
            <span className="font-semibold">Slack</span>
          </div>
          <p className="mb-4 text-sm text-primary">
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
      </div>
    </div>
  );
};
