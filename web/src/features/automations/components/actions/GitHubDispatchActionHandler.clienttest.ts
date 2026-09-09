// @vitest-environment node

import { describe, expect, it } from "vitest";
import { GitHubDispatchActionHandler } from "./GitHubDispatchActionHandler";

const handler = new GitHubDispatchActionHandler();

const formData = (overrides: Record<string, string> = {}) => ({
  githubDispatch: {
    url: overrides.url ?? "https://api.github.com/repos/owner/repo/dispatches",
    originalUrl: overrides.originalUrl,
    eventType: "repository-updated",
    githubToken: overrides.githubToken ?? "",
    displayGitHubToken: overrides.displayGitHubToken ?? "ghp_...ken",
  },
});

describe("GitHubDispatchActionHandler URL and token validation", () => {
  it("requires a new token when the dispatch URL changes", () => {
    const result = handler.validateFormData(
      formData({
        originalUrl: "https://api.github.com/repos/owner/repo/dispatches",
        url: "https://api.github.com/repos/owner/other-repo/dispatches",
      }),
    );

    expect(result).toEqual({
      isValid: false,
      errors: ["GitHub token is required when changing the dispatch URL"],
    });
  });

  it("allows an update without a token for an equivalent URL", () => {
    const result = handler.validateFormData(
      formData({
        originalUrl: "https://github.com/api/v3/repos/owner/repo/dispatches",
        url: "https://GITHUB.COM:443/api/v3/repos/owner/repo/dispatches",
      }),
    );

    expect(result).toEqual({ isValid: true });
  });
});
