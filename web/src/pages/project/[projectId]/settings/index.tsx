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
import {
  useEntitlements,
  useHasEntitlement,
} from "@/src/features/entitlements/hooks";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { useRouter } from "next/router";
import { SettingsDangerZone } from "@/src/components/SettingsDangerZone";
import { ActionButton } from "@/src/components/ActionButton";
import { BatchExportsSettingsPage } from "@/src/features/batch-exports/components/BatchExportsSettingsPage";
import { AuditLogsSettingsPage } from "@/src/ee/features/audit-log-viewer/AuditLogsSettingsPage";
import { ModelsSettings } from "@/src/features/models/components/ModelSettings";
import ConfigureRetention from "@/src/features/projects/components/ConfigureRetention";
import ContainerPage from "@/src/components/layouts/container-page";

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

  const entitlements = useEntitlements();
  const showLLMConnectionsSettings =
    entitlements.includes("playground") ||
    entitlements.includes("model-based-evaluations");

  if (!project || !organization || !router.query.projectId) {
    return [];
  }

  return getProjectSettingsPages({
    project,
    organization,
    showBillingSettings,
    showRetentionSettings,
    showLLMConnectionsSettings,
  });
}

export const getProjectSettingsPages = ({
  project,
  organization,
  showBillingSettings,
  showRetentionSettings,
  showLLMConnectionsSettings,
}: {
  project: { id: string; name: string };
  organization: { id: string; name: string };
  showBillingSettings: boolean;
  showRetentionSettings: boolean;
  showLLMConnectionsSettings: boolean;
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
              project: { name: project.name, id: project.id },
              org: { name: organization.name, id: organization.id },
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
        <ApiKeyList projectId={project.id} />
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
    title: "Models",
    slug: "models",
    cmdKKeywords: ["cost", "token"],
    content: <ModelsSettings projectId={project.id} />,
  },
  {
    title: "Scores / Evaluation",
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
    cmdKKeywords: ["posthog"],
    content: <Integrations projectId={project.id} />,
  },
  {
    title: "Exports",
    slug: "exports",
    cmdKKeywords: ["csv", "download", "json", "batch"],
    content: <BatchExportsSettingsPage projectId={project.id} />,
  },
  {
    title: "Audit Logs",
    slug: "audit-logs",
    cmdKKeywords: ["trail"],
    content: <AuditLogsSettingsPage projectId={project.id} />,
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
  const hasEntitlement = useHasEntitlement("integration-posthog");
  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "integrations:CRUD",
  });

  return (
    <div>
      <Header title="Integrations" />
      <Card className="p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <PostHogLogo className="mb-4 w-40 text-foreground" />
        <p className="mb-4 text-sm text-primary">
          We have teamed up with PostHog (OSS product analytics) to make
          Langfuse Events/Metrics available in your Posthog Dashboards.
        </p>
        <div className="flex items-center gap-2">
          <ActionButton
            variant="secondary"
            hasAccess={hasAccess}
            hasEntitlement={hasEntitlement}
            href={`/project/${props.projectId}/settings/integrations/posthog`}
          >
            Configure
          </ActionButton>
          <Button asChild variant="ghost">
            <Link href="https://langfuse.com/docs/analytics/posthog">
              Integration Docs ↗
            </Link>
          </Button>
        </div>
      </Card>
    </div>
  );
};
