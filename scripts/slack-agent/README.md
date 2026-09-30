# Local Slack agent demo

This demo connects a Slack channel to Langfuse's existing in-app agent using
Socket Mode. The bot runs on your laptop and opens an outbound connection to
Slack. No tunnel, public URL, webhook receiver, or Slack signing secret is needed.
Keep the laptop awake and the bot process running during the demo.

For the request flow, infrastructure, code ownership, and scope, see the
[in-app-agent PoC guide](../../web/src/features/in-app-agent/SLACK_POC.md).

For **individual accounts, DMs or channel threads, and a project picker**, follow
[the linked-account setup guide](./LINKED_SETUP.md) and use
`manifest.linked.json`. This adds a verified connection to each user's Langfuse
account and checks their current project permissions. Linked channel threads
start with a top-level @mention and post project names and answers visibly to
the channel; only the thread owner can choose the project or send follow-ups.

The default channel demo (`SLACK_AGENT_MODE=shared`) uses one configured project. Each Slack user links their own Langfuse
account before the agent can run, and each run uses that account's current
project permissions. Account links and answers are ephemeral Slack messages
visible only to the requesting user. Use synthetic data in a dedicated demo
channel.

## Configure the Slack app

1. Open [Slack app management](https://api.slack.com/apps), choose **Create New
   App → From a manifest**, select your workspace, and paste `manifest.json`
   from this directory. It creates **Langfuse Hackathon** with Socket Mode and
   the Agent feature enabled.
2. Install the app to the workspace under **OAuth & Permissions**. Copy the
   **Bot User OAuth Token** (`xoxb-…`). The requested bot scopes are
   `app_mentions:read`, `chat:write`, and `assistant:write`.
3. Under **Basic Information → App-Level Tokens**, generate a token with the
   `connections:write` scope. Copy this **App Token** (`xapp-…`).
4. Invite the app to your demo channel. Record the workspace ID (`T…`) and
   channel ID (`C…` or `G…`). Slack web URLs contain the workspace ID after
   `/client/`; channel details show the channel ID at the bottom.
5. Confirm **Event Subscriptions** includes `app_mention` and
   `agent_session_stopped`. The manifest sets these automatically.

Some Agent features require a paid Slack workspace or a developer sandbox.
The current native loading API is `agents.sessions.setStatus`. A missing Agent
feature or scope is a configuration error; this demo does not silently replace
the native loading indicator with a regular chat message.

## Prepare Langfuse

Apply the database migrations, start the regular local web and worker services,
and run the repository's base seeder if you need a synthetic project:

```sh
pnpm --filter @langfuse/shared run db:seed
```

For a fresh database, `db:seed:examples` additionally creates datasets and other
synthetic project data. Existing worktree-pool slots already have example data;
rerunning the example seeder can collide with existing dataset versions.

Configure the project in the web process, then sign in to Langfuse with an
account that belongs to that project:

```dotenv
LANGFUSE_IN_APP_AGENT_API_PROJECT_ID=7a88fb47-b4e2-43b8-a06c-a5ce950dc53a
```

The API is disabled when this value is absent. Existing instance enablement,
organization AI consent, entitlement, run limits, and model configuration still
apply. Both web and worker need the existing agent configuration:

```dotenv
LANGFUSE_IN_APP_AGENT_ENABLED=true
LANGFUSE_AI_PROVIDER=anthropic
LANGFUSE_AI_MODEL=YOUR_CONFIGURED_MODEL
LANGFUSE_AI_API_KEY=YOUR_PROVIDER_KEY
```

Use your existing supported provider configuration from `.env.dev.example`;
Bedrock and Vertex use their normal credential chains. The worker must reach
the web app via `LANGFUSE_MCP_BASE_URL` or `NEXTAUTH_URL`. Restart web/worker
after changing their configuration. With the local worktree pool, use its
`lf-wt` commands and avoid editing generated slot environment files.

On a cold development server, the first agent request can time out while Next.js
compiles the MCP endpoint. Warm the route before the demo, or send a new question
after it has compiled. A retry with the same idempotency key returns the original
run, including a failed run.

For Bedrock, refresh an expired AWS SSO session with
`aws sso login --profile YOUR_PROFILE`. The worker uses `AWS_PROFILE` first,
then `LANGFUSE_IN_APP_AGENT_AWS_PROFILE`. Keep credential values out of the bot
configuration; the existing Langfuse worker owns model-provider access.

Finish build and lint checks before a live demo. The development worker watches
shared build output, so rebuilding shared code can interrupt an active run.

## Configure and run the bot

From the repository root:

```sh
cp scripts/slack-agent/.env.dev.example scripts/slack-agent/.env.local
chmod 600 scripts/slack-agent/.env.local
```

Edit the ignored `.env.local` file locally. Never paste tokens into chat:

| Variable              | Value                                                        |
| --------------------- | ------------------------------------------------------------ |
| `SLACK_BOT_TOKEN`     | Bot User OAuth Token, beginning `xoxb-`                      |
| `SLACK_APP_TOKEN`     | App-Level Token, beginning `xapp-`, with `connections:write` |
| `SLACK_TEAM_ID`       | Allowed workspace ID                                         |
| `SLACK_CHANNEL_ID`    | Allowed demo channel ID                                      |
| `LANGFUSE_BASE_URL`   | Your local web URL, including the correct port               |
| `LANGFUSE_PUBLIC_KEY` | Project public key; example uses the synthetic seed key      |
| `LANGFUSE_SECRET_KEY` | Project secret key; example uses the synthetic seed key      |

```sh
mise exec -- pnpm run slack:agent
```

To load credentials from a 1Password Environment, use a CLI build that supports
`--environment`:

```sh
op run --environment YOUR_ENVIRONMENT_ID -- pnpm run slack:agent
```

The local env file is optional when all seven settings are supplied by the
process environment. If the Environment only contains Slack credentials, keep
the Langfuse URL and project API keys in the ignored local env file. Process
environment values take precedence over the file.

The success message is `Slack agent connected. Listening in …`. Only one bot
process should use this app and local state file at a time.

In the allowed channel, send:

> @langfuse-hackathon What datasets exist in this project?

On your first mention, the bot privately prompts you to link your Langfuse
account. Open the link, sign in if needed, and confirm the project and Slack
identity. Links expire after ten minutes and can be used once. Then mention the
bot again with your question. Slack displays the native working indicator,
and the answer appears privately in the channel, or in the same thread when
your mention is a thread reply. For follow-ups, mention the bot again in that
thread. Each sender has a separate conversation. Ordinary
unmentioned messages are not subscribed to. A concurrent question receives a
private "still working" notice. The native stop button requests cancellation
of the Langfuse run.

Thread mappings and pending run IDs are saved in the ignored
`scripts/slack-agent/state.local.json` file. Accepted message text is removed
from that file; an unaccepted pending message may remain there until submission.
Restarting the bot resumes pending runs. Slack event IDs are also used as
durable Langfuse idempotency keys. Completed Slack deliveries are remembered
for seven days. A crash between Slack accepting an answer and saving its
delivery state can still duplicate the final reply.

Do not change projects or Langfuse instances while retaining this state file;
stop the bot and move the file aside before starting a separate demo.

## API contract

All routes use the configured project's normal BasicAuth public/secret keys.
Use a dedicated key for the bridge. Each confirmed connection delegates one
Slack workspace/user identity to that specific key; another project key cannot
reuse it. The bridge is trusted to report Slack's authenticated event identity.
Only API-created conversations owned by the linked user are accepted.

- `POST /api/public/agent/connections`: `{provider: "slack", workspaceId,
externalUserId}` returns `{connectionId, userId, linkUrl}`. A linked account
  has a `userId` and no `linkUrl`; an unlinked account has a private confirmation
  URL and no `userId`. Deliver the URL only to the requesting Slack user.
- `POST /api/public/agent/runs`: `{connectionId, message, conversationId?, idempotencyKey}`
  returns HTTP 202 with `{runId, conversationId}`. Repeating the same request
  returns the same run. Reusing its key for another message is rejected.
- `GET /api/public/agent/runs/{runId}?connectionId=...`: returns `{runId, conversationId,
status, text, errorCode, cancelRequested}`. Text contains only the requested
  run's assistant response, not reasoning or tool results.
- `POST /api/public/agent/runs/{runId}/cancel?connectionId=...`: requests cancellation.

The bot polls every two seconds. Streaming text and tool-progress cards are
future additions; the native working indicator does not require either.

## Account permissions

The connection is saved only after a signed-in Langfuse user explicitly confirms
it and current project membership is checked. Langfuse stores a digest of the
temporary link token, consumes it atomically, and records an audit event. The
server resolves the linked user on every request, checks current permissions,
and sets both the run owner and trusted `langfuse_user_id` message context.
The worker checks current roles again before execution. A caller-supplied
Langfuse user ID cannot authorize a run.

Deleting the bridge API key removes its connections. A replacement key requires
fresh account confirmation. There is no Slack tool-approval UI yet: the bridge
cancels any run that requires approval. Private ephemeral replies are not a
durable Slack conversation archive.

## Individual permissions and multiple projects

[Linked mode](./LINKED_SETUP.md) implements verified account linking, current
user permissions, and one-project-per-thread routing in DMs and channels. It uses a separate
trusted integration credential; the shared project's public API does not accept
arbitrary user IDs. A user connects once with a short-lived code from Langfuse,
then chooses a project from a searchable Slack dropdown. The original question
continues automatically after selection. In a channel, start with a top-level
@mention. The thread owner can then reply without another mention; questions
arriving during an active run are queued. The project is fixed for the thread,
and other members cannot act as its owner. Project names and answers are
visible to everyone who can read the channel. Connection codes remain DM-only.

Linked mode requires `channels:history` and `groups:history`, plus
`message.channels` and `message.groups` events. Apply `manifest.linked.json`
and reinstall the app after adding these permissions. `SLACK_CHANNEL_ID` is an
optional channel restriction in linked mode. `LANGFUSE_PUBLIC_URL` optionally
sets the human-facing account-link origin separately from the bot's
`LANGFUSE_BASE_URL` API address; it defaults to that base URL.

## Verification

```sh
pnpm run slack:agent:test
```

The adapter tests cover repeated events, conversation continuity, scope
restrictions, account-link prompts, per-user conversation isolation, private
replies, stopping during submission, restart recovery, failure cleanup, and
refusing insecure remote credential destinations. Server tests cover connection
expiry and single use, API-key binding, current permissions, idempotency, and run
output boundaries.
