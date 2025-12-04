import { encrypt, generateWebhookSecret } from "@langfuse/shared/encryption";
import {
  type ActionCreate,
  type ActionConfig,
  type GitHubDispatchActionConfigWithSecrets,
  type GitHubDispatchActionCreate,
  isGitHubDispatchActionConfig,
} from "@langfuse/shared";
import {
  getActionByIdWithSecrets,
  validateWebhookURL,
} from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";

interface GitHubDispatchConfigOptions {
  actionConfig: ActionCreate;
  actionId?: string;
  projectId: string;
}

export async function processGitHubDispatchActionConfig({
  actionConfig,
  actionId,
  projectId,
}: GitHubDispatchConfigOptions): Promise<{
  finalActionConfig: ActionConfig;
  githubToken?: string; // For one-time display
}> {
  if (actionConfig.type !== "GITHUB_DISPATCH") {
    throw new Error("Action type is not GITHUB_DISPATCH");
  }

  const gitHubDispatchConfig = actionConfig as GitHubDispatchActionCreate;

  const existingAction = actionId
    ? await getActionByIdWithSecrets({ projectId, actionId })
    : undefined;

  let existingActionConfig: GitHubDispatchActionConfigWithSecrets | undefined;
  if (existingAction) {
    if (!isGitHubDispatchActionConfig(existingAction.config)) {
      throw new Error(
        `Existing action ${actionId} does not have valid GitHub dispatch configuration`,
      );
    }
    existingActionConfig = existingAction.config;
  }

  // Validate GitHub API URL format (without DNS lookup)
  const urlPattern =
    /^https:\/\/api\.github\.com\/repos\/[^\/]+\/[^\/]+\/dispatches$/;
  const enterprisePattern =
    /^https:\/\/[^\/]+\/api\/v3\/repos\/[^\/]+\/[^\/]+\/dispatches$/;

  if (
    !urlPattern.test(gitHubDispatchConfig.url) &&
    !enterprisePattern.test(gitHubDispatchConfig.url)
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "URL must be a valid GitHub repository dispatch endpoint (e.g., https://api.github.com/repos/owner/repo/dispatches)",
    });
  }

  // Determine the token to use
  let tokenToUse: string;
  let displayToken: string;
  let returnToken: string | undefined;

  if (
    gitHubDispatchConfig.githubToken &&
    gitHubDispatchConfig.githubToken.trim() !== ""
  ) {
    // User provided a new token
    tokenToUse = gitHubDispatchConfig.githubToken;
    displayToken = maskGitHubToken(tokenToUse);
    returnToken = tokenToUse; // Return for one-time display
  } else if (existingActionConfig?.githubToken) {
    // Keep existing token (update without changing token)
    tokenToUse = existingActionConfig.githubToken; // Already encrypted
    displayToken = existingActionConfig.displayGitHubToken;
    returnToken = undefined; // Don't return existing token
  } else {
    // No token provided and no existing token - this is an error for creation
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "GitHub Personal Access Token is required",
    });
  }

  return {
    finalActionConfig: {
      ...gitHubDispatchConfig,
      type: "GITHUB_DISPATCH",
      githubToken: returnToken !== undefined ? encrypt(tokenToUse) : tokenToUse, // Encrypt if new, keep as-is if already encrypted
      displayGitHubToken: displayToken,
      lastFailingExecutionId: existingActionConfig?.lastFailingExecutionId,
    },
    githubToken: returnToken,
  };
}

// Helper function to mask GitHub tokens for display
function maskGitHubToken(token: string): string {
  if (token.length < 6) {
    return token; // Too short to mask meaningfully
  }
  const prefix = token.substring(0, 4);
  const suffix = token.substring(token.length - 1);
  return `${prefix}...${suffix}`;
}
