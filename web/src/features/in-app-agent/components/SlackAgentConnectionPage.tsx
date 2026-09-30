import Head from "next/head";
import { useSession } from "next-auth/react";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/design-system/Button/Button";
import { Spinner } from "@/src/components/design-system/Spinner/Spinner";
import { api } from "@/src/utils/api";

export type SlackAgentConnectionPageProps =
  | { status: "manage" | "invalid" }
  | {
      status: "ready";
      token: string;
      connection: { teamId: string; slackUserId: string; expiresAt: string };
    };

export default function SlackAgentConnectionPage(
  props: SlackAgentConnectionPageProps,
) {
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
          {props.status === "ready" && <ConnectionConfirmation {...props} />}
          {props.status === "invalid" && (
            <Alert variant="destructive">
              <Alert.Description>
                This link is invalid, expired, or already used. Return to Slack
                and message Halo again to get a fresh link.
              </Alert.Description>
            </Alert>
          )}
          {props.status === "manage" && <ConnectionManagement />}
        </section>
      </main>
    </>
  );
}

SlackAgentConnectionPage.skipAppLayout = true;

function ConnectionConfirmation({
  token,
  connection,
}: Extract<SlackAgentConnectionPageProps, { status: "ready" }>) {
  const session = useSession();
  const confirm = api.slackAgent.confirmConnection.useMutation({ gcTime: 0 });

  if (session.status === "loading") {
    return (
      <div className="flex items-center gap-2 text-sm" role="status">
        <Spinner size="sm" />
        Checking your account…
      </div>
    );
  }
  if (session.status !== "authenticated" || !session.data.user) {
    return (
      <Button
        text="Sign in to Langfuse"
        href="/auth/sign-in?targetPath=%2Fslack-agent"
      />
    );
  }
  if (confirm.isSuccess) {
    return (
      <Alert>
        <Alert.Title>Account linked</Alert.Title>
        <Alert.Description>
          Return to Slack and send your question again. Choose a project when
          Halo prompts you; follow-ups in that thread stay on the same project.
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
        <dt className="text-muted-foreground">Slack workspace</dt>
        <dd>{connection.teamId}</dd>
        <dt className="text-muted-foreground">Slack user</dt>
        <dd>{connection.slackUserId}</dd>
        <dt className="text-muted-foreground">Project</dt>
        <dd>Choose in Slack for each new thread</dd>
      </dl>
      <p className="text-muted-foreground text-sm">
        Only continue if this is your Slack account and you trust this agent.
        Linking lets Halo run agent requests as you in projects you can access,
        using your current permissions. Answers in channel threads are visible
        to everyone in that channel.
      </p>
      {confirm.error ? (
        <Alert variant="destructive">
          <Alert.Description>
            {confirm.error.data?.code === "CONFLICT"
              ? "This Slack account is already linked to another Langfuse account. Disconnect it from that account first, then request a fresh link."
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

function ConnectionManagement() {
  const session = useSession();
  const utils = api.useUtils();
  const status = api.slackAgent.status.useQuery(undefined, {
    enabled: session.status === "authenticated",
    refetchOnWindowFocus: true,
  });
  const disconnect = api.slackAgent.disconnect.useMutation({
    onSuccess: () => utils.slackAgent.status.invalidate(),
  });

  if (session.status === "loading" || status.isLoading) {
    return <p role="status">Loading your connection…</p>;
  }
  if (session.status !== "authenticated") {
    return (
      <Button
        text="Sign in to Langfuse"
        href="/auth/sign-in?targetPath=%2Fslack-agent"
      />
    );
  }
  if (status.error) {
    return (
      <Alert variant="destructive">
        <Alert.Description>
          Could not load your Slack connection. Try again.
        </Alert.Description>
      </Alert>
    );
  }
  if (!status.data?.enabled) {
    return (
      <p>Slack account linking is not enabled on this Langfuse instance.</p>
    );
  }
  return (
    <>
      <p className="text-sm">
        Send Halo a direct message or mention it in a channel. Open the private
        link it sends you, then confirm your account here. No connection code is
        needed.
      </p>
      <section className="flex flex-col gap-3">
        <h2 className="font-bold">Connected Slack accounts</h2>
        {status.data.links.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No accounts connected yet.
          </p>
        ) : (
          status.data.links.map((link) => (
            <div
              key={link.id}
              className="flex items-center justify-between gap-4 rounded-lg border p-4"
            >
              <span className="text-sm">Slack user {link.slackUserId}</span>
              <Button
                text="Disconnect"
                variant="secondary"
                loading={disconnect.isPending}
                onClick={() => {
                  disconnect.mutate({ linkId: link.id });
                }}
              />
            </div>
          ))
        )}
        {disconnect.error ? (
          <Alert variant="destructive">
            <Alert.Description>
              Could not disconnect. Try again.
            </Alert.Description>
          </Alert>
        ) : null}
        <p className="text-muted-foreground text-sm">
          Disconnecting prevents further Slack access. Answers already posted in
          Slack remain there. Reconnecting starts fresh conversations.
        </p>
      </section>
    </>
  );
}
