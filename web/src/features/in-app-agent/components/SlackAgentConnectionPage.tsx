import { useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/src/components/design-system/Button/Button";
import ContainerPage from "@/src/components/layouts/container-page";
import { api } from "@/src/utils/api";

export default function SlackAgentConnectionPage() {
  const session = useSession();
  const utils = api.useUtils();
  const [copyStatus, setCopyStatus] = useState("");
  const status = api.slackAgent.status.useQuery(undefined, {
    enabled: session.status === "authenticated",
    refetchOnWindowFocus: true,
  });
  const createCode = api.slackAgent.createCode.useMutation({ gcTime: 0 });
  const disconnect = api.slackAgent.disconnect.useMutation({
    onSuccess: async () => {
      createCode.reset();
      await utils.slackAgent.status.invalidate();
    },
  });

  let content: ReactNode;
  if (session.status === "loading" || status.isLoading) {
    content = <p role="status">Loading your connection…</p>;
  } else if (session.status === "unauthenticated") {
    content = (
      <Button
        text="Sign in to Langfuse"
        href="/auth/sign-in?targetPath=%2Fslack-agent"
      />
    );
  } else if (status.error) {
    content = (
      <p role="alert">Could not load your Slack connection. Try again.</p>
    );
  } else if (!status.data?.enabled) {
    content = (
      <p>
        Slack account linking is not enabled on this Langfuse instance. Ask the
        person running your Slack app to enable it first.
      </p>
    );
  } else {
    content = (
      <>
        <section className="flex flex-col gap-3 rounded-lg border p-4">
          <h2 className="font-bold">Connect your account</h2>
          <p className="text-sm">
            Signed in as <strong>{session.data?.user?.email}</strong>. The Slack
            account that uses this code will be able to ask questions about
            projects you can access in workspace {status.data.teamId}. Only send
            the code to your trusted Langfuse app in a direct message. It
            expires after five minutes and can be used once.
          </p>
          <div>
            <Button
              text={
                createCode.data
                  ? "Generate a new code"
                  : "Generate connection code"
              }
              loading={createCode.isPending}
              onClick={() => {
                setCopyStatus("");
                createCode.mutate();
              }}
            />
          </div>
          {createCode.error && (
            <p role="alert" className="text-sm">
              Could not generate a connection code. Try again.
            </p>
          )}
          {createCode.data && (
            <div className="flex flex-col gap-3">
              <p className="text-sm">
                Copy this command into a direct message with your Slack app:
              </p>
              <textarea
                aria-label="Slack connection command"
                className="bg-muted w-full resize-none rounded-md border p-3 font-mono text-sm"
                readOnly
                rows={2}
                value={`connect ${createCode.data.code}`}
                onFocus={(event) => {
                  event.currentTarget.select();
                }}
              />
              <div>
                <Button
                  text="Copy command"
                  variant="secondary"
                  onClick={async () => {
                    if (!createCode.data) {
                      return;
                    }
                    try {
                      await navigator.clipboard.writeText(
                        `connect ${createCode.data.code}`,
                      );
                      setCopyStatus("Copied. Paste it into Slack.");
                    } catch {
                      setCopyStatus(
                        "Select the command above and copy it manually.",
                      );
                    }
                  }}
                />
              </div>
              <p role="status" className="text-muted-foreground text-sm">
                {copyStatus ||
                  "After connecting, send a question in Slack to choose a project."}
              </p>
            </div>
          )}
        </section>

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
          {disconnect.error && (
            <p role="alert" className="text-sm">
              Could not disconnect. Try again.
            </p>
          )}
          <p className="text-muted-foreground text-sm">
            Disconnecting prevents further Slack access. Answers already posted
            in Slack remain there. Reconnecting starts fresh conversations.
          </p>
        </section>
      </>
    );
  }

  return (
    <ContainerPage headerProps={{ title: "Connect Slack" }}>
      <div className="ph-no-capture flex max-w-xl flex-col gap-6 py-6">
        <p className="text-muted-foreground text-sm">
          Ask the Langfuse agent questions in a direct message with your Slack
          app. Choose a project when you start a thread; follow-up questions
          stay in that project.
        </p>
        {content}
      </div>
    </ContainerPage>
  );
}
