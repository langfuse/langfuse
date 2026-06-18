---
name: langfuse-codebase-navigator
description: Navigate Langfuse repositories, code areas, and agent skills. Use when a user or agent asks where Langfuse code lives, which Langfuse repo to inspect, which Langfuse skill applies, how to search across Langfuse repositories, or how to orient in the Langfuse org before implementing, debugging, documenting, supporting, or operating Langfuse.
---

# Langfuse Codebase Navigator

Use this as the first stop for Langfuse org navigation. Your job is to choose the right repository, code area, and more specific skill before doing deeper work.

## Default Workflow

1. Classify the request by domain:
   - Product app, API, backend, ingestion, worker, ClickHouse, model pricing, evals, prompts, datasets, scores, traces: `langfuse/langfuse`.
   - Documentation, changelog, blog, marketing pages, cookbook, integrations docs: `langfuse/langfuse-docs`.
   - SDK or client library behavior: `langfuse/langfuse-js`, `langfuse/langfuse-python`, `langfuse/langfuse-java`, or generated clients in `langfuse/langfuse`.
   - Deployment or self-hosting: `langfuse/langfuse-k8s`, `langfuse/langfuse-terraform-*`, `langfuse/oss-llmops-stack`, and docs self-hosting content.
   - Langfuse Cloud infrastructure and ops: `langfuse/infrastructure`, `langfuse/analytics`, `langfuse/langfuse-ops`, or `langfuse/platform`.
   - Agent skills: `langfuse/skills`, `langfuse/langfuse-internal-skills`, repo-local `.agents/skills`, or repo-local `.claude/skills`.
   - GitHub Actions, CLI, MCP, n8n, examples, or experiments: route to the specialized repo in `references/repository-map.md`.
2. Read [references/repository-map.md](references/repository-map.md) when the route is not obvious, the task spans repos, or the user asks for org-level orientation.
3. Before editing, check for a more specific skill in the target repo or a sibling internal-skills checkout. If one matches, open it and follow it.
4. Search locally first in sibling repos next to the current checkout. If a needed repo is absent, clone it into the same parent directory with `gh repo clone langfuse/<repo> "$LANGFUSE_PARENT/<repo>"`.
5. Return or act on a route decision with: target repo(s), relevant folders/files, specific skills to load, and the next search command or implementation step.

## Quick Skill Routing

- Product implementation in `langfuse/langfuse`: choose the matching repo-local skill under `.agents/skills`, such as `backend-dev-guidelines`, `frontend-browser-review`, `clickhouse-best-practices`, `add-model-price`, `turborepo`, `pnpm-upgrade-package`, `code-review`, or production-debug skills as applicable.
- Frontend work under `langfuse/langfuse/web`: also check `web/.agents/skills/vercel-react-best-practices` and `web/.agents/skills/vercel-composition-patterns`.
- Infrastructure autoscaling or cloud capacity: use `infra-scaling`.
- Public Langfuse usage, docs lookup, API access, instrumentation, prompt migration, SDK upgrade, trace analysis, or CLI work: use the public `langfuse` skill from `langfuse/skills`.
- Support, support review, PR funnel, social copy, meeting notes, Plain search, blog writing, or unslop work: use the matching skill from `langfuse/langfuse-internal-skills` when available.

## Search Patterns

Use `rg` and file lists before broad reading.

```bash
# Resolve the parent directory that holds sibling Langfuse repos
LANGFUSE_REPO_ROOT="$(git rev-parse --show-toplevel)"
LANGFUSE_PARENT="$(dirname "$LANGFUSE_REPO_ROOT")"

# Find local Langfuse checkouts next to this repo
find "$LANGFUSE_PARENT" -mindepth 2 -maxdepth 2 -type d -name .git -print | sed 's#/.git$##'

# Search one repo
cd "$LANGFUSE_PARENT/langfuse"
rg --files -g '!node_modules' -g '!.git' | rg 'prompts|datasets|scores|traces'
rg -n "symbolOrRouteName" web/src packages/shared/src worker/src

# Refresh org repo inventory when freshness matters
gh repo list langfuse --limit 1000 --json name,description,isPrivate,isArchived,isFork,primaryLanguage,pushedAt,updatedAt,url
```

For cross-repo code search, prefer local clones if present. Fall back to GitHub search only for repos that are absent locally or when you need to confirm the current default branch.

## Routing Output

When the user asks "where is this?" or "which skill/repo should I use?", answer in this shape:

- `Route`: repo(s) and why.
- `Open first`: exact skill path or code folder.
- `Search next`: one or two concrete `rg` or `gh` commands.
- `Caveat`: only include this if the route depends on sparse private-repo metadata or a recently changing repo list.

If multiple routes are plausible and acting in the wrong repo would be risky, ask one concise clarifying question. Otherwise choose the most likely route and keep moving.
