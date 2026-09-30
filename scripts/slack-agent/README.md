# Local Slack agent demo

This demo connects a Slack channel to Langfuse's existing in-app agent using
Socket Mode. The bot runs on your laptop and opens an outbound connection to
Slack. No tunnel, public URL, webhook receiver, or Slack signing secret is needed.
Keep the laptop awake and the bot process running during the demo.

For the request flow, infrastructure, code ownership, and scope, see the
[in-app-agent PoC guide](../../web/src/features/in-app-agent/SLACK_POC.md).

The demo uses one configured project and a dedicated non-admin Langfuse user
with effective `VIEWER` access. Everyone in the allowed Slack channel shares
that access. It does not link Slack users to individual Langfuse accounts.
Use synthetic data in a dedicated demo channel.

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

Start the regular local web and worker services, and run the repository's base
seeder to create the demo identity:

```sh
pnpm --filter @langfuse/shared run db:seed
```

For a fresh database, `db:seed:examples` additionally creates datasets and other
synthetic project data. Existing worktree-pool slots already have example data;
rerunning the example seeder can collide with existing dataset versions.

The base seeder creates the execution-only `slack-agent-demo` user with `VIEWER`
access to the synthetic project. Configure these values in the web process:

```dotenv
LANGFUSE_IN_APP_AGENT_API_PROJECT_ID=7a88fb47-b4e2-43b8-a06c-a5ce950dc53a
LANGFUSE_IN_APP_AGENT_API_USER_ID=slack-agent-demo
```

The API is disabled when these values are absent. Existing instance enablement,
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

The success message is `Slack agent connected. Listening in …`. Only one bot
process should use this app and local state file at a time.

In the allowed channel, send:

> @langfuse-hackathon What datasets exist in this project?

Slack displays the native working indicator, then the answer appears in the
same thread. For follow-ups, mention the bot again in that thread. Ordinary
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
Only API-created conversations owned by the configured demo user are accepted.

- `POST /api/public/agent/runs`: `{message, conversationId?, idempotencyKey}`
  returns HTTP 202 with `{runId, conversationId}`. Repeating the same request
  returns the same run. Reusing its key for another message is rejected.
- `GET /api/public/agent/runs/{runId}`: returns `{runId, conversationId,
status, text, errorCode, cancelRequested}`. Text contains only the requested
  run's assistant response, not reasoning or tool results.
- `POST /api/public/agent/runs/{runId}/cancel`: requests cancellation.

The bot polls every two seconds. Streaming text and tool-progress cards are
future additions; the native working indicator does not require either.

## Individual permissions later

Add an account-linking flow that verifies a Slack workspace/user pair against a
signed-in Langfuse account. Resolve that user's current project membership on
each request and execute as that user. A project API key alone does not identify
the Slack user, so accepting an arbitrary `userId` in this API would not be a safe
substitute. Keep conversations bound to their authenticated owner, and send
private project results to a DM or another appropriately restricted surface.

The existing worker already checks the execution user's permissions. The new
work would be verified account linking and user-scoped API authorization,
replacing this demo's fixed VIEWER identity.

## Verification

```sh
pnpm run slack:agent:test
```

The adapter tests cover repeated events, conversation continuity, scope
restrictions, stopping during submission, restart recovery, failure cleanup,
and refusing insecure remote credential destinations. Server tests cover the
API's authentication, read-only identity, idempotency, and run output boundaries.
