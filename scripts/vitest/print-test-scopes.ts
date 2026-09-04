import { appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createSharedPackageVcsProvider,
  selectTestScopes,
} from "./shared-package-vcs-provider.ts";

const changedSince = process.argv[2];
const repositoryRoot = resolve(process.cwd());
// Empty changed-since is the full-suite path: merge_group, push,
// workflow_dispatch, and pull requests labeled `full-test`.
const changedFiles = changedSince
  ? await createSharedPackageVcsProvider().findChangedFiles({
      root: repositoryRoot,
      changedSince,
    })
  : [];
const scopes = selectTestScopes(
  changedFiles,
  repositoryRoot,
  Boolean(changedSince),
);
const dockerMatrix = {
  include: [
    ...(scopes.web
      ? [
          {
            component: "web",
            service: "langfuse-web",
            runner: "blacksmith-8vcpu-ubuntu-2404",
            health_url: "http://localhost:3000/api/public/health",
          },
        ]
      : []),
    ...(scopes.worker
      ? [
          {
            component: "worker",
            service: "langfuse-worker",
            runner: "blacksmith-4vcpu-ubuntu-2404",
            health_url: "http://localhost:3030/api/health",
          },
        ]
      : []),
  ],
};
const output = [
  ...Object.entries(scopes).map(([scope, selected]) => `${scope}=${selected}`),
  `docker-matrix=${JSON.stringify(dockerMatrix)}`,
].join("\n");

console.log(output);

if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `${output}\n`);
}

if (process.env.GITHUB_STEP_SUMMARY) {
  const selected = Object.entries(scopes)
    .filter(([, enabled]) => enabled)
    .map(([scope]) => `\`${scope}\``)
    .join(", ");
  await appendFile(
    process.env.GITHUB_STEP_SUMMARY,
    `## Vitest selection\n\nSelected scopes: ${selected || "none"}\n\nStorybook, Playwright e2e, server e2e, and package lint follow the web/shared/worker scopes. Merge groups and \`full-test\` PRs select every scope.\n`,
  );
}
