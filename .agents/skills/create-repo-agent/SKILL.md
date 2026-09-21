---
name: create-repo-agent
description: Design, implement, review, or harden Langfuse repo-owned autonomous agents. Use for LLM-powered GitHub Actions, scheduled or dispatched agents, agent-created PRs, prompts, allowlists, tokens, untrusted content, or self-updating instructions.
---

# Create Repo Agent

## Purpose

Build repo agents that can run unattended without granting the model broad write credentials, arbitrary shell, or uncontrolled network access. The default architecture is a read-only audit job that produces a validated patch artifact plus a separate publisher job that owns GitHub writes.

Use this skill together with the domain skill for the files the agent will maintain. For example, a pricing agent must also use `add-model-price`.

## Required Reading

For every repo agent task, read these references before designing or editing:

1. `references/security-standards.md`
2. `references/workflow-blueprint.md` when implementing or changing a GitHub Actions workflow
3. `references/review-checklist.md` before final review or PR publication

## Workflow

1. Define the exact maintenance objective, allowed files, external sources, expected no-change behavior, and PR ownership.
2. Choose the least-capable runtime: prefer a scheduled/manual GitHub Action with read-only repository checkout and no write credentials in the LLM step.
3. Encode the prompt with explicit allowed edit surfaces, hard constraints, source-evidence requirements, and structured output.
4. Give the agent only scoped file tools, domain-scoped fetch tools, and exact deterministic validator commands.
5. Validate the diff independently of the agent, including untracked files, path allowlists, `git diff --check`, line-count limits, and domain-specific validators.
6. Publish from a separate job or step after validation, using a bot credential only for branch push and PR create/update.
7. If self-improvement is allowed, constrain it to named workflow or skill-reference files and require security invariants to remain unchanged.
8. Run agent setup checks when `.agents/**` changes, then publish a normal human-reviewable PR.

## Non-Negotiables

- Never expose a write-capable GitHub token, PAT, GitHub App token, OIDC token, SSH key, cloud credential, or package-publishing token to the LLM agent step.
- Never rely on prompt instructions as the only security boundary. Enforce file and command limits outside the agent.
- Never stage a directory wholesale. Stage only the validated file list.
- Never ignore untracked files in diff validation.
- Never let self-improvement bypass the same diff allowlist and human PR review as normal edits.
- Never grant arbitrary `Bash`, `curl`, `wget`, `gh`, `git push`, package-manager, interpreter, environment-dump, or process-inspection tools to the LLM agent.
- Never add `id-token: write` unless the agent truly needs OIDC and the trust relationship is reviewed explicitly.
