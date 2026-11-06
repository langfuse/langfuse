export type ActivityDemoStory = "agentique" | "halo" | "coding";
export type ActivityDemoRole =
  | "orchestrator"
  | "researcher"
  | "reviewer"
  | "writer"
  | "router";
export type ActivityDemoMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: ActivityDemoToolCall[];
};
export type ActivityDemoToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};
type Evidence = { title: string; url: string; excerpt: string };
export type ActivityDemoTask = {
  slug: string;
  title: string;
  questions: [string, string, string];
  finding: string;
  answer: string;
  evidence: Evidence[];
  file?: { path: string; before: string; patch: string; tests: string[] };
};
export type ActivityDemoToolExchange = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
};

const document = (title: string, path: string, excerpt: string): Evidence => ({
  title,
  url: `https://example.com/docs/${path}`,
  excerpt,
});
const researchTasks: ActivityDemoTask[] = [
  {
    slug: "safe-deployment",
    title: "Safe feature deployment",
    questions: [
      "Which documents explain deploying a feature safely?",
      "Double-check rollback and flag unsupported timing claims.",
      "Write the final release note with references.",
    ],
    finding:
      "The deployment guide requires approval and health checks. The release checklist requires the previous release to remain available for rollback. Neither document guarantees a deployment duration.",
    answer:
      "Deploy after approval, verify health checks, and keep the previous release available for rollback. The sources do not establish a fixed deployment duration. [Deployment guide](https://example.com/docs/deployment) · [Release checklist](https://example.com/docs/release-checklist)",
    evidence: [
      document(
        "Deployment guide",
        "deployment",
        "Obtain release approval. Deploy to staging first, then verify production health checks.",
      ),
      document(
        "Release checklist",
        "release-checklist",
        "Keep the previous release available. Roll back if the release owner rejects the health-check results. No completion-time guarantee is specified.",
      ),
    ],
  },
  {
    slug: "retention-policy",
    title: "Log retention and deletion",
    questions: [
      "How long do we retain application logs, and how are deletion requests handled?",
      "Distinguish live logs from backup retention and identify the owner.",
      "Summarize the retention policy with the relevant sources.",
    ],
    finding:
      "Application logs expire after 30 days. Approved deletion requests remove live records within seven days; encrypted backups expire on their separate 35-day schedule.",
    answer:
      "Keep application logs for 30 days. The privacy owner approves deletion requests; live records are removed within seven days, while backups expire after 35 days. [Retention policy](https://example.com/docs/log-retention) · [Deletion procedure](https://example.com/docs/deletion)",
    evidence: [
      document(
        "Log retention",
        "log-retention",
        "Application logs have a 30-day TTL. Encrypted backups expire after 35 days.",
      ),
      document(
        "Deletion procedure",
        "deletion",
        "The privacy owner approves requests. Remove live records within seven days; backups expire through the documented retention schedule.",
      ),
    ],
  },
  {
    slug: "gradual-rollout",
    title: "Gradual rollout gates",
    questions: [
      "What checks should precede a gradual feature rollout?",
      "Check the rollout percentages and who approves moving to the next stage.",
      "Draft a staged rollout checklist with citations.",
    ],
    finding:
      "The rollout guide specifies 10%, 50%, then 100% exposure, with the release owner reviewing error rate and latency before each increase. Exposure does not advance automatically.",
    answer:
      "Start at 10%, review error rate and latency with the release owner, then proceed to 50% and 100% only after approval. Stop or roll back when a gate fails. [Rollout guide](https://example.com/docs/rollouts) · [Release gates](https://example.com/docs/release-gates)",
    evidence: [
      document(
        "Rollout guide",
        "rollouts",
        "Use 10%, 50%, and 100% exposure stages. The release owner approves each increase.",
      ),
      document(
        "Release gates",
        "release-gates",
        "Review error rate and latency at every gate. Failed gates stop rollout; automation does not grant approval.",
      ),
    ],
  },
  {
    slug: "restore-readiness",
    title: "Backup restore readiness",
    questions: [
      "What recovery guarantees are documented for the reporting service?",
      "Separate the backup schedule from the time required for a restore.",
      "Write a recovery-readiness summary with unsupported claims removed.",
    ],
    finding:
      "The service creates daily backups and exercises restores weekly. The runbook targets a 24-hour recovery point but makes no fixed restore-duration promise.",
    answer:
      "Expect daily backups and a 24-hour recovery-point target. Verify the weekly restore exercise before relying on a backup; restore duration is not guaranteed. [Backup policy](https://example.com/docs/backups) · [Restore runbook](https://example.com/docs/restore)",
    evidence: [
      document(
        "Backup policy",
        "backups",
        "Create an encrypted backup daily. The recovery-point target is 24 hours.",
      ),
      document(
        "Restore runbook",
        "restore",
        "Run a restore exercise weekly and record the result. Restore duration depends on data volume and is not guaranteed.",
      ),
    ],
  },
  {
    slug: "rate-limit-policy",
    title: "Safe API retry policy",
    questions: [
      "How should a client respond to rate limits without duplicating writes?",
      "Check Retry-After, retry limits, and idempotency requirements.",
      "Summarize the safe retry policy with references.",
    ],
    finding:
      "Read requests may retry 429 and 5xx responses up to three attempts. Respect Retry-After. Writes require an idempotency key before retrying.",
    answer:
      "Respect Retry-After and stop after three attempts. Retry a write only when it has an idempotency key; do not retry ordinary client errors. [Rate limits](https://example.com/docs/rate-limits) · [Idempotency](https://example.com/docs/idempotency)",
    evidence: [
      document(
        "Rate limits",
        "rate-limits",
        "For reads, retry 429 and 5xx responses at most three times and respect Retry-After.",
      ),
      document(
        "Idempotency",
        "idempotency",
        "Retried writes must use the same idempotency key. Other 4xx responses require correction, not retries.",
      ),
    ],
  },
  {
    slug: "access-review",
    title: "SSO and service-account access",
    questions: [
      "Who can change SSO settings and create service-account credentials?",
      "Check the distinction between organization admins and project maintainers.",
      "Prepare an access-review checklist with source links.",
    ],
    finding:
      "Organization admins manage SSO; project maintainers create project-scoped service credentials. Quarterly reviews verify owners and revoke unused credentials.",
    answer:
      "Ask an organization admin to change SSO. Project maintainers can create credentials for their own project. Review owners and unused credentials quarterly. [SSO roles](https://example.com/docs/sso-roles) · [Credential review](https://example.com/docs/credential-review)",
    evidence: [
      document(
        "SSO roles",
        "sso-roles",
        "Only organization admins change SSO configuration. Project maintainers cannot change organization authentication.",
      ),
      document(
        "Credential review",
        "credential-review",
        "Project maintainers issue project-scoped credentials. Review ownership and revoke unused credentials every quarter.",
      ),
    ],
  },
];
const productTasks: ActivityDemoTask[] = [
  {
    slug: "audit-history",
    title: "Audit history and plan permissions",
    questions: [
      "Does our team plan include audit history and how can we change it?",
      "Check which settings require an organization admin.",
      "Write a short answer with links to the relevant product documentation.",
    ],
    finding:
      "The synthetic Team plan retains audit history for 30 days. Enterprise retains it for 365 days. Only organization admins can request a plan change.",
    answer:
      "Your Team plan includes 30 days of audit history. Ask an organization admin to review an upgrade if you need longer retention. I have not changed your plan. [Plan guide](https://example.com/docs/plans) · [Organization settings](https://example.com/docs/organization-settings)",
    evidence: [
      document(
        "Plan guide",
        "plans",
        "Team includes 30 days of audit history. Enterprise includes 365 days.",
      ),
      document(
        "Organization settings",
        "organization-settings",
        "Organization admins can request plan changes. Members can view their current plan but cannot change it.",
      ),
    ],
  },
  {
    slug: "invite-members",
    title: "Invite a teammate safely",
    questions: [
      "How can I invite a teammate without giving them admin access?",
      "Check the default role and whether pending invitations consume a seat.",
      "Give me the invitation steps and the relevant help links.",
    ],
    finding:
      "Admins invite members with the Member role by default. A seat is consumed only after the invitation is accepted; invitations expire after seven days.",
    answer:
      "Ask an admin to open Members → Invite and select Member. The invitation expires in seven days and consumes a seat when accepted. No invitation was sent by this assistant. [Invitations](https://example.com/docs/invitations) · [Member roles](https://example.com/docs/member-roles)",
    evidence: [
      document(
        "Invitations",
        "invitations",
        "Admins send invitations. Pending invitations expire after seven days and consume no seat until accepted.",
      ),
      document(
        "Member roles",
        "member-roles",
        "Member is the default invitation role. Admin rights must be granted explicitly.",
      ),
    ],
  },
  {
    slug: "export-data",
    title: "Export project records",
    questions: [
      "Can I export last month's project records as CSV?",
      "Check the export limit and what permissions are needed.",
      "Explain how to prepare the export without claiming it has already run.",
    ],
    finding:
      "Project maintainers can export up to 10,000 filtered records per CSV. Larger exports use the asynchronous export workflow.",
    answer:
      "Filter the project to last month and choose Export → CSV. Maintainer access is required, and a CSV is limited to 10,000 records; use asynchronous export for more. I have not started an export. [CSV export](https://example.com/docs/csv-export) · [Export permissions](https://example.com/docs/export-permissions)",
    evidence: [
      document(
        "CSV export",
        "csv-export",
        "CSV exports contain at most 10,000 filtered records. Larger jobs use asynchronous export.",
      ),
      document(
        "Export permissions",
        "export-permissions",
        "Project maintainers can export records. Viewers cannot create an export.",
      ),
    ],
  },
  {
    slug: "alert-routing",
    title: "Configure alert recipients",
    questions: [
      "How do I send latency alerts to our operations team?",
      "Check the evaluation interval and whether alerts change the application.",
      "Summarize the configuration steps with links.",
    ],
    finding:
      "Maintainers configure a latency threshold and email recipients. Rules are evaluated every five minutes and only send notifications.",
    answer:
      "As a maintainer, create a latency rule and add the operations email recipients. Rules run every five minutes and notify; they do not restart or modify your app. [Alerts](https://example.com/docs/alerts) · [Notification routing](https://example.com/docs/notification-routing)",
    evidence: [
      document(
        "Alerts",
        "alerts",
        "Maintainers configure thresholds. Rules evaluate every five minutes and send notifications only.",
      ),
      document(
        "Notification routing",
        "notification-routing",
        "Add one or more verified email recipients. Alert rules do not execute application changes.",
      ),
    ],
  },
  {
    slug: "rotate-api-key",
    title: "Rotate a project API key",
    questions: [
      "How can I rotate a project API key without interrupting ingestion?",
      "Check whether the old key is revoked automatically.",
      "Write a safe rotation checklist without exposing a key.",
    ],
    finding:
      "Maintainers create a second project key, deploy it, and verify traffic before explicitly revoking the old key. Creating a key does not revoke existing keys.",
    answer:
      "Create a replacement key, deploy it, and verify traffic before revoking the old one. Existing keys remain valid until revoked. Never paste a secret into chat. No credentials were created or changed. [API keys](https://example.com/docs/api-keys) · [Key rotation](https://example.com/docs/key-rotation)",
    evidence: [
      document(
        "API keys",
        "api-keys",
        "Project maintainers create and revoke keys. Secret values are shown only at creation.",
      ),
      document(
        "Key rotation",
        "key-rotation",
        "Deploy a replacement and verify traffic before revoking the prior key. Creating a key does not revoke existing keys.",
      ),
    ],
  },
  {
    slug: "data-region",
    title: "Choose a data region",
    questions: [
      "Can I move this project to a different data region from settings?",
      "Check whether existing data moves when the SDK endpoint changes.",
      "Explain the supported migration process and its limits.",
    ],
    finding:
      "A project's region is fixed at creation. Changing an SDK endpoint sends new data to a separately created project; historical data does not move automatically.",
    answer:
      "Create a project in the destination region and update its credentials and SDK endpoint. Changing an endpoint does not transfer historical data. Ask an admin to review the migration plan first. [Regions](https://example.com/docs/regions) · [Project migration](https://example.com/docs/project-migration)",
    evidence: [
      document(
        "Regions",
        "regions",
        "A project's region is selected at creation and cannot be switched in settings.",
      ),
      document(
        "Project migration",
        "project-migration",
        "New-region ingestion requires a project and credentials there. Changing the SDK endpoint does not transfer historical data.",
      ),
    ],
  },
];
const codingTasks: ActivityDemoTask[] = [
  {
    slug: "bounded-retries",
    title: "Bound document-fetch retries",
    questions: [
      "Add bounded retries to the synthetic document fetcher without retrying client errors.",
      "Review the timeout and backoff behavior and identify the smallest regression test.",
      "Prepare the patch summary and test plan.",
    ],
    finding:
      "The fetcher currently retries every non-success response. Restrict retries to network failures and 5xx responses, cap attempts at three, and preserve the caller's timeout.",
    answer:
      "Proposed change in `src/documents/fetch.ts`: retry network failures and 5xx responses at most three times, preserve cancellation, and return 4xx responses immediately. Add a 503→200 test and a 400-without-retry test. This is an authored patch proposal; no repository tests were executed.",
    evidence: [],
    file: {
      path: "src/documents/fetch.ts",
      before:
        "export async function fetchDocument(url, signal) {\n  while (true) {\n    const response = await fetch(url, { signal });\n    if (response.ok) return response;\n  }\n}",
      patch:
        "for (let attempt = 0; attempt < 3; attempt++) {\n  const response = await fetch(url, { signal });\n  if (response.ok || response.status < 500) return response;\n  if (attempt < 2) await backoff(attempt, signal);\n}\nthrow new Error('Retry limit reached');",
      tests: [
        "503 then 200 uses two attempts",
        "400 returns after one attempt",
        "aborted signal stops the backoff",
      ],
    },
  },
  {
    slug: "cursor-pagination",
    title: "Stop cursor pagination correctly",
    questions: [
      "Fix the synthetic records client so an empty next cursor ends pagination.",
      "Check that the existing filters survive each page request.",
      "Prepare the smallest patch and regression test.",
    ],
    finding:
      "The client treats an empty cursor as another page. Stop on null or empty nextCursor and retain the original filters for every request.",
    answer:
      "Proposed change in `src/records/list.ts`: retain the original filters and stop when `nextCursor` is null or empty. Test a two-page result and assert no third request. These are authored assertions, not executed test results.",
    evidence: [],
    file: {
      path: "src/records/list.ts",
      before:
        "do {\n  const page = await listRecords({ cursor });\n  items.push(...page.items);\n  cursor = page.nextCursor;\n} while (cursor !== null);",
      patch:
        "const page = await listRecords({ ...filters, cursor });\nitems.push(...page.items);\ncursor = page.nextCursor || null;",
      tests: [
        "empty nextCursor stops after two requests",
        "every request retains the original filters",
      ],
    },
  },
  {
    slug: "tenant-cache",
    title: "Isolate a project cache",
    questions: [
      "Review a synthetic cache key that may collide across projects.",
      "Check the key fields and how to test isolation without real customer data.",
      "Write a scoped patch proposal and two-project test plan.",
    ],
    finding:
      "The cache key contains the record ID but omits project ID. Prefixing with project ID prevents equal record IDs from sharing cached values across projects.",
    answer:
      "Proposed change in `src/cache/records.ts`: include project ID in the record-cache key. Use two synthetic projects with the same record ID to verify isolation. No production data was accessed and no tests were run.",
    evidence: [],
    file: {
      path: "src/cache/records.ts",
      before: "const key = `record:${recordId}`;\nreturn cache.get(key);",
      patch:
        "const key = `project:${projectId}:record:${recordId}`;\nreturn cache.get(key);",
      tests: [
        "same record ID in two projects returns distinct values",
        "cache invalidation uses the same project-qualified key",
      ],
    },
  },
  {
    slug: "cancel-timeout",
    title: "Preserve caller cancellation",
    questions: [
      "Add a timeout to the synthetic search client without losing caller cancellation.",
      "Check how timeout cleanup behaves after success and failure.",
      "Summarize the patch and cancellation regression test.",
    ],
    finding:
      "The search client replaces the caller signal with its own timeout signal. Combining both signals preserves cancellation and bounds the request duration.",
    answer:
      "Proposed change in `src/search/client.ts`: combine the caller signal with a five-second timeout. Test caller cancellation and timeout separately, and ensure successful requests leave no pending timer. This is a synthetic proposal, not an executed patch.",
    evidence: [],
    file: {
      path: "src/search/client.ts",
      before: "return fetch(url, { signal: AbortSignal.timeout(5000) });",
      patch:
        "const timeout = AbortSignal.timeout(5000);\nconst combined = signal ? AbortSignal.any([signal, timeout]) : timeout;\nreturn fetch(url, { signal: combined });",
      tests: [
        "caller abort cancels the request",
        "request exceeding five seconds times out",
      ],
    },
  },
  {
    slug: "redact-logs",
    title: "Redact authorization headers",
    questions: [
      "Remove secret headers from the synthetic request logger.",
      "Check that header matching is case-insensitive and useful diagnostics remain.",
      "Prepare a redaction patch and a focused test plan.",
    ],
    finding:
      "The logger serializes every header, including Authorization. Redact authorization and cookie values case-insensitively while retaining request ID and method.",
    answer:
      "Proposed change in `src/logging/request.ts`: redact authorization and cookie headers using case-insensitive names. Keep method and request ID for debugging. Test mixed-case headers with synthetic placeholders; no real secrets or logs were used.",
    evidence: [],
    file: {
      path: "src/logging/request.ts",
      before: "logger.info({ method, headers: Object.fromEntries(headers) });",
      patch:
        "const safe = Object.fromEntries([...headers].map(([key, value]) =>\n  [key, /^(authorization|cookie)$/i.test(key) ? '[REDACTED]' : value]));\nlogger.info({ method, requestId, headers: safe });",
      tests: [
        "mixed-case authorization is redacted",
        "request ID and method remain visible",
      ],
    },
  },
  {
    slug: "webhook-dedup",
    title: "Deduplicate webhook delivery",
    questions: [
      "Prevent duplicate processing of the same synthetic webhook event.",
      "Check the project boundary and what happens if processing fails.",
      "Write the idempotency patch proposal and retry test plan.",
    ],
    finding:
      "The handler has no persisted event key. Claim the project-qualified event ID transactionally, and do not mark it complete when processing fails.",
    answer:
      "Proposed change in `src/webhooks/handler.ts`: claim each project-qualified event ID transactionally, process it once, and mark completion only after success. Test duplicate delivery and a failed attempt followed by a retry. This is an authored plan; no webhook was sent.",
    evidence: [],
    file: {
      path: "src/webhooks/handler.ts",
      before: "await processWebhook(event);\nreturn { accepted: true };",
      patch:
        "await transaction(async (tx) => {\n  const claim = await tx.claimEvent(projectId, event.id);\n  if (!claim.acquired) return;\n  await processWebhook(event, tx);\n  await tx.completeEvent(projectId, event.id);\n});",
      tests: [
        "duplicate delivery processes the event once",
        "failed processing leaves the event retryable",
      ],
    },
  },
];

export function getActivityDemoTask(story: ActivityDemoStory, index: number) {
  const tasks = {
    agentique: researchTasks,
    halo: productTasks,
    coding: codingTasks,
  }[story];
  return tasks[index % tasks.length]!;
}

export function activityDemoSystemPrompt(
  story: ActivityDemoStory,
  role: ActivityDemoRole,
) {
  const domain = {
    agentique: "a research assistant that cites supplied primary documents",
    halo: "a product assistant that explains documented capabilities and permissions without changing account settings",
    coding:
      "a coding assistant that proposes scoped changes to synthetic source files and never presents authored tests as executed",
  }[story];
  const responsibility = {
    orchestrator:
      "Delegate research, review and drafting. Return the completed answer to the user, including important limitations and sources.",
    researcher:
      "Inspect the supplied evidence with the available tools. Return precise findings and source references; label missing evidence.",
    reviewer:
      "Check the delegated findings against the evidence. Identify unsupported claims and request correction before approving a draft.",
    writer:
      "Write a concise answer that resolves the user's request using the verified findings. Include source links or file paths and distinguish a proposal from an executed change.",
    router:
      "Route this product question to the evidence-backed product-search workflow; do not invent plan entitlements.",
  }[role];
  return `You are ${domain}. ${responsibility} This is a synthetic demonstration, not a live account or repository.`;
}

export function activityDemoRoleDescription(
  story: ActivityDemoStory,
  role: ActivityDemoRole,
) {
  return activityDemoSystemPrompt(story, role).split(
    " This is a synthetic demonstration",
  )[0]!;
}

export function activityDemoDelegatedPrompt(
  task: ActivityDemoTask,
  role: ActivityDemoRole,
  question: string,
  ordinal: number,
) {
  const instructions = {
    orchestrator: "Coordinate the specialists and return the final answer.",
    researcher: `Research pass ${ordinal + 1}: inspect ${task.file?.path ?? task.evidence[ordinal % task.evidence.length]?.title ?? "the supplied evidence"}. Verify the relevant constraints and return evidence rather than an unsupported conclusion.`,
    reviewer:
      "Review the research findings for accuracy, scope, and unsupported claims. State whether the draft is ready to use.",
    writer: task.file
      ? "Prepare the proposed patch and a focused test plan. Explicitly say that no repository change or test execution occurred."
      : "Write the user-facing answer with the verified constraints and source links. Do not claim to have performed an action.",
    router:
      "Route this question to product search and preserve the user's permission constraints.",
  }[role];
  return `${instructions}\n\nUser request: ${question}\n\nTask: ${task.title}${role === "reviewer" || role === "writer" ? `\n\nResearch findings: ${task.finding}` : ""}`;
}

export function activityDemoToolExchange(
  task: ActivityDemoTask,
  name: string,
  question: string,
  ordinal: number,
): ActivityDemoToolExchange {
  const evidence = task.evidence[ordinal % Math.max(1, task.evidence.length)];
  const query = {
    type: "object",
    properties: { query: { type: "string" } },
    required: ["query"],
  };
  if (name === "search_repository")
    return {
      name,
      description:
        "Search synthetic repository files for the requested behavior.",
      parameters: query,
      input: { query: task.title },
      output: {
        matches: [
          {
            path: task.file!.path,
            line: 1,
            preview: task.file!.before.split("\n")[0],
          },
        ],
        synthetic: true,
      },
    };
  if (name === "read_source_file")
    return {
      name,
      description:
        "Read an authored synthetic source file; no local repository is accessed.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
      input: { path: task.file!.path },
      output: {
        path: task.file!.path,
        startLine: 1,
        content: task.file!.before,
        synthetic: true,
      },
    };
  if (name === "propose_patch")
    return {
      name,
      description: "Return a patch proposal without changing files.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" }, patch: { type: "string" } },
        required: ["path", "patch"],
      },
      input: { path: task.file!.path, patch: task.file!.patch },
      output: {
        path: task.file!.path,
        proposedPatch: task.file!.patch,
        applied: false,
        synthetic: true,
      },
    };
  if (name === "inspect_test_plan")
    return {
      name,
      description: "Inspect an authored test plan without executing tests.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
      input: { path: task.file!.path },
      output: {
        cases: task.file!.tests,
        executed: false,
        result: "reviewed-plan",
        synthetic: true,
      },
    };
  if (name === "check_citations")
    return {
      name,
      description:
        "Check whether the supplied source excerpts support the draft's factual claims.",
      parameters: {
        type: "object",
        properties: {
          claim: { type: "string" },
          sources: { type: "array", items: { type: "string" } },
        },
        required: ["claim", "sources"],
      },
      input: {
        claim: task.finding,
        sources: task.evidence.map((item) => item.url),
      },
      output: {
        supported: true,
        checkedSources: task.evidence.map((item) => item.url),
        unsupportedClaims: [],
        synthetic: true,
      },
    };
  if (name === "read_document")
    return {
      name,
      description: "Read a synthetic primary-document excerpt by URL.",
      parameters: {
        type: "object",
        properties: { url: { type: "string" } },
        required: ["url"],
      },
      input: { url: evidence!.url },
      output: { ...evidence, synthetic: true },
    };
  if (name === "read_plan_limits")
    return {
      name,
      description:
        "Read documented synthetic plan limits and the required role for a product action.",
      parameters: {
        type: "object",
        properties: { topic: { type: "string" }, plan: { type: "string" } },
        required: ["topic", "plan"],
      },
      input: { topic: task.slug, plan: "Team" },
      output: {
        plan: "Team",
        finding: task.finding,
        documentation: task.evidence,
        changedSettings: false,
        synthetic: true,
      },
    };
  return {
    name,
    description:
      "Search the supplied synthetic documentation for relevant primary sources.",
    parameters: query,
    input: { query: question },
    output: { results: task.evidence, synthetic: true },
  };
}
