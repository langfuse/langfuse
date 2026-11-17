import { processGitHubDispatchActionConfig } from "@/src/features/automations/server/githubDispatchHelpers";

describe("processGitHubDispatchActionConfig", () => {
  it("rejects a non-dispatch URL with the dispatch endpoint message before resolving its host", async () => {
    await expect(
      processGitHubDispatchActionConfig({
        projectId: "project-1",
        actionConfig: {
          type: "GITHUB_DISPATCH",
          url: "https://unresolvable-host.invalid/not-github",
          eventType: "langfuse-alert",
          githubToken: "ghp_token",
        },
      }),
    ).rejects.toThrow(
      "URL must be a valid GitHub repository dispatch endpoint",
    );
  });
});
