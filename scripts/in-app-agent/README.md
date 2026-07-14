# In-App Agent Sync

## Skill Sync

Generated skill markdown lives in:

- `web/src/ee/features/in-app-agent/server/skills/generated/raw`
- `web/src/ee/features/in-app-agent/server/skills/generated/skill-markdown.ts`

Sync or check generated skills:

```sh
node scripts/in-app-agent/sync-raw-skills.mjs
node scripts/in-app-agent/sync-raw-skills.mjs --check
```

## Prompt And Eval Sync

Canonical files:

- Prompt: `web/src/ee/features/in-app-agent/prompts/in-app-agent-system-prompt.txt`
- Evaluators: `web/src/features/in-app-agent/evaluators/*-evaluator.json`
- Evaluation rules: `web/src/features/in-app-agent/evaluators/*-evaluation-rule.json`

Targets: `LOCAL`, `STAGING`, `EU`, `US`, `JP`, `HIPAA`.

```sh
export LANGFUSE_AI_FEATURES_SYNC_TARGETS="LOCAL"
export LANGFUSE_AI_FEATURES_LOCAL_BASE_URL="http://localhost:3000"
export LANGFUSE_AI_FEATURES_LOCAL_PUBLIC_KEY="pk-lf-..."
export LANGFUSE_AI_FEATURES_LOCAL_SECRET_KEY="sk-lf-..."
```

For other targets, set:

```sh
export LANGFUSE_AI_FEATURES_<TARGET>_PUBLIC_KEY="pk-lf-..."
export LANGFUSE_AI_FEATURES_<TARGET>_SECRET_KEY="sk-lf-..."
```

If using a dotenv file with plain assignments:

```sh
set -a; source .env; set +a
```

Sync the prompt:

```sh
./scripts/in-app-agent/sync-prompt.sh
```

Sync evaluators:

```sh
pnpm assistant:sync-evals -- --dry-run
pnpm assistant:sync-evals
pnpm assistant:sync-evals -- --yes
```

Prompt sync requires `curl` and `jq`. Evaluators use the target project's
default evaluation model because `modelConfig` is `null`.

## Verify

```sh
curl --silent --show-error \
  --user "$LANGFUSE_AI_FEATURES_EU_PUBLIC_KEY:$LANGFUSE_AI_FEATURES_EU_SECRET_KEY" \
  "https://cloud.langfuse.com/api/public/v2/prompts/in-app-agent-system-prompt"

curl --silent --show-error \
  --user "$LANGFUSE_AI_FEATURES_EU_PUBLIC_KEY:$LANGFUSE_AI_FEATURES_EU_SECRET_KEY" \
  "https://cloud.langfuse.com/api/public/unstable/evaluators?page=1&limit=100" \
  | jq '.data[] | select(.name | startswith("iaa-"))'
```
