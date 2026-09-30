import Head from "next/head";
import { useSession } from "next-auth/react";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/design-system/Button/Button";
import { Spinner } from "@/src/components/design-system/Spinner/Spinner";
import { api } from "@/src/utils/api";

export type AgentConnectionPageProps =
  | { status: "invalid" }
  | {
      status: "ready";
      token: string;
      connection: {
        projectId: string;
        projectName: string;
        workspaceId: string;
        externalUserId: string;
        apiKeyName: string | null;
      };
    };

export default function AgentConnectionPage(props: AgentConnectionPageProps) {
  return (
    <>
      <Head>
        <title>Link your Slack account | Langfuse</title>
        <meta name="referrer" content="no-referrer" />
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <main className="flex min-h-screen items-center justify-center p-6">
        <section className="ph-no-capture bg-background flex w-full max-w-lg flex-col gap-6 rounded-lg border p-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-xl font-bold">Link your Slack account</h1>
            <p className="text-muted-foreground text-sm">
              Let the Slack agent use your Langfuse account permissions.
            </p>
          </div>
          {props.status === "ready" ? (
            <ConnectionConfirmation {...props} />
          ) : (
            <Alert variant="destructive">
              <Alert.Description>
                This link is invalid, expired, or already used. Return to Slack
                and mention the agent again to get a fresh link.
              </Alert.Description>
            </Alert>
          )}
        </section>
      </main>
    </>
  );
}

AgentConnectionPage.skipAppLayout = true;

function ConnectionConfirmation({
  token,
  connection,
}: Extract<AgentConnectionPageProps, { status: "ready" }>) {
  const session = useSession();
  const confirm = api.agentUserConnections.confirm.useMutation();

  if (session.status === "loading") {
    return (
      <div className="flex items-center gap-2 text-sm" role="status">
        <Spinner size="sm" /> Checking your account…
      </div>
    );
  }

  if (session.status !== "authenticated" || !session.data.user) {
    return (
      <Button
        text="Sign in to Langfuse"
        href="/auth/sign-in?targetPath=%2Fagent%2Fconnect"
      />
    );
  }

  if (confirm.isSuccess) {
    return (
      <Alert>
        <Alert.Title>Account linked</Alert.Title>
        <Alert.Description>
          Return to Slack and mention the agent again to continue your request.
        </Alert.Description>
      </Alert>
    );
  }

  return (
    <>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
        <dt className="text-muted-foreground">Langfuse account</dt>
        <dd className="break-all">
          {session.data.user.email ?? session.data.user.name}
        </dd>
        <dt className="text-muted-foreground">Project</dt>
        <dd className="break-all">{connection.projectName}</dd>
        <dt className="text-muted-foreground">Slack workspace</dt>
        <dd>{connection.workspaceId}</dd>
        <dt className="text-muted-foreground">Slack user</dt>
        <dd>{connection.externalUserId}</dd>
        <dt className="text-muted-foreground">Agent connection</dt>
        <dd className="break-all">
          {connection.apiKeyName ?? "Project API key"}
        </dd>
      </dl>
      <p className="text-muted-foreground text-sm">
        Only continue if this is your Slack account and you trust this agent
        connection. Linking lets the connection run agent requests as you in
        this project, using your current permissions.
      </p>
      {confirm.error ? (
        <Alert variant="destructive">
          <Alert.Description>
            {confirm.error.data?.code === "FORBIDDEN"
              ? "Your account could not authorize this connection. Check that you have access to this project, then request a fresh link in Slack."
              : "This connection could not be completed. The link may have expired or already been used. Request a fresh link in Slack and try again."}
          </Alert.Description>
        </Alert>
      ) : null}
      <Button
        text="Link my account"
        loading={confirm.isPending}
        onClick={() => {
          confirm.mutate({ token });
        }}
      />
    </>
  );
}
