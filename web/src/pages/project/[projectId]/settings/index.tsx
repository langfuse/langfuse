import Header from "@/src/components/layouts/header";
import { ApiKeyList } from "@/src/features/public-api/components/ApiKeyList";
import { LockIcon } from "lucide-react";
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
import { useHasOrgEntitlement } from "@/src/features/entitlements/hooks";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { useRouter } from "next/router";
import { SettingsDangerZone } from "@/src/components/SettingsDangerZone";

export default function SettingsPage() {
  const { project, organization } = useQueryProject();
  const router = useRouter();
  const showBillingSettings = useHasOrgEntitlement("cloud-billing");
  if (!project || !organization) return null;
  return (
    <div className="lg:container">
      <Header title="Project Settings" />
      <PagedSettingsContainer
        activeSlug={router.query.page as string | undefined}
        pages={[
          {
            title: "General",
            slug: "index",
            content: (
              <div className="flex flex-col gap-6">
                <HostNameProject />
                <RenameProject />
                <div>
                  <Header title="Debug Information" level="h3" />
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
            content: (
              <div className="flex flex-col gap-6">
                <ApiKeyList projectId={project.id} />
                <LlmApiKeyList projectId={project.id} />
              </div>
            ),
          },
          {
            title: "Scores / Evaluation",
            slug: "scores",
            content: <ScoreConfigSettings projectId={project.id} />,
          },
          {
            title: "Members",
            slug: "members",
            content: (
              <div>
                <Header title="Project Members" level="h3" />
                <div>
                  <MembersTable
                    orgId={organization.id}
                    project={{ id: project.id, name: project.name }}
                  />
                </div>
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
            content: <Integrations projectId={project.id} />,
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
        ]}
      />
    </div>
  );
}

const Integrations = (props: { projectId: string }) => {
  const entitled = useHasOrgEntitlement("integration-posthog");
  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "integrations:CRUD",
  });

  return (
    <div>
      <Header title="Integrations" level="h3" />
      <Card className="p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <PostHogLogo className="mb-4 w-40 text-foreground" />
        <p className="mb-4 text-sm text-primary">
          We have teamed up with PostHog (OSS product analytics) to make
          Langfuse Events/Metrics available in your Posthog Dashboards.
        </p>
        <div className="flex items-center gap-2">
          {entitled && hasAccess ? (
            <Button variant="secondary" asChild>
              <Link
                href={`/project/${props.projectId}/settings/integrations/posthog`}
              >
                Configure
              </Link>
            </Button>
          ) : (
            <Button variant="secondary" disabled>
              <LockIcon className="mr-2 h-4 w-4" />
              {!hasAccess
                ? "Configure"
                : !entitled
                  ? "Public-beta on Langfuse Cloud"
                  : ""}
            </Button>
          )}
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
