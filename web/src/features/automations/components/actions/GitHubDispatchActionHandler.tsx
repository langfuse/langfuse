import React from "react";
import { type UseFormReturn } from "react-hook-form";
import { type BaseActionHandler } from "./BaseActionHandler";
import { GitHubDispatchActionForm } from "./GitHubDispatchActionForm";
import {
  type AutomationDomain,
  type ActionCreate,
  type ActionDomain,
} from "@langfuse/shared";
import { z } from "zod/v4";

// Define the form schema for GitHub dispatch actions
export const GitHubDispatchActionFormSchema = z.object({
  githubDispatch: z.object({
    url: z.string().url("Invalid URL"),
    eventType: z.string().min(1, "Event type is required").max(100),
    githubToken: z.string(),
    displayGitHubToken: z.string().optional(), // Display value for existing token
  }),
});

type GitHubDispatchActionFormData = z.infer<
  typeof GitHubDispatchActionFormSchema
>;

export class GitHubDispatchActionHandler
  implements BaseActionHandler<GitHubDispatchActionFormData>
{
  actionType = "GITHUB_DISPATCH" as const;

  getDefaultValues(
    automation?: AutomationDomain,
  ): GitHubDispatchActionFormData {
    return {
      githubDispatch: {
        url:
          (automation?.action?.type === "GITHUB_DISPATCH" &&
            automation?.action?.config &&
            "url" in automation.action.config &&
            automation.action.config.url) ||
          "",
        eventType:
          (automation?.action?.type === "GITHUB_DISPATCH" &&
            automation?.action?.config &&
            "eventType" in automation.action.config &&
            automation.action.config.eventType) ||
          "",
        githubToken: "", // Never populate with existing token for security
        displayGitHubToken:
          automation?.action?.type === "GITHUB_DISPATCH" &&
          automation?.action?.config &&
          "displayGitHubToken" in automation.action.config
            ? automation.action.config.displayGitHubToken
            : undefined,
      },
    };
  }

  validateFormData(formData: GitHubDispatchActionFormData): {
    isValid: boolean;
    errors?: string[];
  } {
    const errors: string[] = [];

    if (!formData.githubDispatch?.url) {
      errors.push("GitHub dispatch URL is required");
    }

    if (!formData.githubDispatch?.eventType) {
      errors.push("Event type is required");
    } else if (formData.githubDispatch.eventType.length > 100) {
      errors.push("Event type must be 100 characters or less");
    }

    // Token is required only if there's no existing token (displayGitHubToken)
    if (
      !formData.githubDispatch?.githubToken &&
      !formData.githubDispatch?.displayGitHubToken
    ) {
      errors.push("GitHub token is required");
    }

    return {
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  buildActionConfig(formData: GitHubDispatchActionFormData): ActionCreate {
    return {
      type: "GITHUB_DISPATCH",
      // Only include fields if they have values (for updates)
      ...(formData.githubDispatch?.url
        ? { url: formData.githubDispatch.url }
        : {}),
      ...(formData.githubDispatch?.eventType
        ? { eventType: formData.githubDispatch.eventType }
        : {}),
      ...(formData.githubDispatch?.githubToken
        ? { githubToken: formData.githubDispatch.githubToken }
        : {}),
    };
  }

  renderForm(props: {
    form: UseFormReturn<GitHubDispatchActionFormData>;
    disabled: boolean;
    projectId: string;
    action?: ActionDomain;
  }) {
    return (
      <GitHubDispatchActionForm
        form={props.form}
        disabled={props.disabled}
        projectId={props.projectId}
        action={props.action}
      />
    );
  }
}
