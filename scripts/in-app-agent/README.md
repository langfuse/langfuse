# In-App Agent Prompt Sync

The canonical system prompt for the in-app agent lives at:

`web/src/ee/features/in-app-agent/prompts/in-app-agent-system-prompt.txt`

The local Postgres seeder reads this file and creates the text prompt named
`in-app-agent-system-prompt` in the seed project
`7a88fb47-b4e2-43b8-a06c-a5ce950dc53a` with the `production` and `latest`
labels.

## Manual Sync

Use `sync-prompt.sh` to create the prompt in a Langfuse project via the public
API. If the prompt already exists in a region, the same API call adds a new
version instead.

Set the target project credentials for all cloud regions before running the
script:

```sh
export LANGFUSE_AI_FEATURES_EU_PUBLIC_KEY="pk-lf-..."
export LANGFUSE_AI_FEATURES_EU_SECRET_KEY="sk-lf-..."
export LANGFUSE_AI_FEATURES_US_PUBLIC_KEY="pk-lf-..."
export LANGFUSE_AI_FEATURES_US_SECRET_KEY="sk-lf-..."
export LANGFUSE_AI_FEATURES_JP_PUBLIC_KEY="pk-lf-..."
export LANGFUSE_AI_FEATURES_JP_SECRET_KEY="sk-lf-..."
export LANGFUSE_AI_FEATURES_HIPAA_PUBLIC_KEY="pk-lf-..."
export LANGFUSE_AI_FEATURES_HIPAA_SECRET_KEY="sk-lf-..."

./scripts/in-app-agent/sync-prompt.sh
```

Or move the export statements to a .env file and run:

```sh
(source .env; ./sync-prompt.sh)
```

The script asks for confirmation before syncing each Langfuse Cloud region:
`https://cloud.langfuse.com`, `https://us.cloud.langfuse.com`,
`https://jp.cloud.langfuse.com`, and `https://hipaa.cloud.langfuse.com`.

The script assumes `curl` and `jq` are installed and available on `PATH`.

## Verify

```sh
LANGFUSE_PUBLIC_KEY="$LANGFUSE_AI_FEATURES_EU_PUBLIC_KEY" \
LANGFUSE_SECRET_KEY="$LANGFUSE_AI_FEATURES_EU_SECRET_KEY" \
LANGFUSE_BASE_URL="https://cloud.langfuse.com" \
langfuse api prompts get in-app-agent-system-prompt --label production
```

Run the verification command with the corresponding regional public key, secret
key, and base URL.
