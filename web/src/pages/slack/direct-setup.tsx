import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import { api } from "@/src/utils/api";
import ContainerPage from "@/src/components/layouts/container-page";
import Header from "@/src/components/layouts/header";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { CheckCircle } from "lucide-react";

/**
 * Marketplace onboarding page.
 *
 * Landing point after a user installs the Langfuse app from the Slack
 * Marketplace (the OAuth callback redirects here when no project was chosen up
 * front). Lets the signed-in user link the pending Slack installation to one of
 * their projects. Mirrors the organizations overview page layout. Unauthenticated
 * users are redirected to sign in / sign up by the global AppLayout auth guard.
 */
export default function SlackDirectSetupPage() {
  const router = useRouter();
  const session = useSession();

  const teamId =
    typeof router.query.team_id === "string" ? router.query.team_id : "";
  const claim =
    typeof router.query.claim === "string" ? router.query.claim : "";
  const teamNameFromQuery =
    typeof router.query.team_name === "string" ? router.query.team_name : "";

  const pending = api.slack.getPendingInstallation.useQuery(
    { teamId, claim },
    { enabled: !!teamId && !!claim && session.status === "authenticated" },
  );

  const connectableProjects = api.slack.getConnectableProjects.useQuery(
    undefined,
    { enabled: session.status === "authenticated" },
  );

  const linkMutation = api.slack.linkPendingInstallation.useMutation({
    onSuccess: (data, variables) => {
      router.push(
        `/project/${variables.projectId}/settings/integrations/slack?success=true&team_name=${encodeURIComponent(
          data.teamName ?? "",
        )}`,
      );
    },
  });

  // While the session resolves, show a loading state. Truly unauthenticated
  // users are redirected to sign in by the global AppLayout auth guard before
  // this page renders, so this branch only covers the brief loading window.
  if (session.status !== "authenticated") {
    return (
      <ContainerPage headerProps={{ title: "Connect Slack" }}>
        <p className="text-muted-foreground text-sm">Loading…</p>
      </ContainerPage>
    );
  }

  const workspaceName =
    pending.data?.teamName || teamNameFromQuery || "your Slack workspace";

  // No teamId, or the pending install was not found / has expired.
  const installInvalid =
    !teamId || !claim || (pending.isSuccess && !pending.data.isPending);

  const orgs = connectableProjects.data ?? [];

  return (
    <ContainerPage
      headerProps={{
        title: "Connect Slack",
        help: {
          description:
            "Choose which Langfuse project should receive alerts in this Slack workspace.",
        },
      }}
    >
      {installInvalid ? (
        <Card>
          <CardHeader>
            <CardTitle>Installation expired</CardTitle>
            <CardDescription>
              We could not find an active Slack installation to link. Please
              reinstall the Langfuse app from Slack and try again.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <p className="text-muted-foreground mb-6 text-sm">
            Connect the Slack workspace <strong>{workspaceName}</strong> to a
            Langfuse project. Alerts and prompt notifications for that project
            will post to channels you choose.
          </p>

          {linkMutation.error ? (
            <p className="text-destructive mb-4 text-sm">
              {linkMutation.error.message}
            </p>
          ) : null}

          {connectableProjects.isLoading ? (
            <p className="text-muted-foreground text-sm">Loading projects…</p>
          ) : orgs.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>No eligible projects</CardTitle>
                <CardDescription>
                  You need a project where you can configure automations to
                  connect Slack. Ask an organization admin for access, or create
                  a project first.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            orgs.map((org, index) => (
              <div key={org.orgId} className={index > 0 ? "mt-8" : ""}>
                <Header title={org.orgName} className="truncate" />
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {org.projects.map((project) => {
                    const isLinking =
                      linkMutation.isPending &&
                      linkMutation.variables?.projectId === project.projectId;

                    return (
                      <Card key={project.projectId}>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2 text-base">
                            <span className="min-w-0 truncate">
                              {project.projectName}
                            </span>
                            {project.isConnected ? (
                              <CheckCircle
                                className="h-4 w-4 shrink-0 text-green-600 dark:text-green-500"
                                aria-label="Connected to Slack"
                              />
                            ) : null}
                          </CardTitle>
                        </CardHeader>
                        <CardFooter>
                          <Button
                            className="w-full"
                            variant="secondary"
                            loading={isLinking}
                            disabled={linkMutation.isPending}
                            onClick={() =>
                              linkMutation.mutate({
                                projectId: project.projectId,
                                teamId,
                                claim,
                              })
                            }
                          >
                            {project.isConnected ? "Reconnect" : "Connect"}
                          </Button>
                        </CardFooter>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </>
      )}
    </ContainerPage>
  );
}
