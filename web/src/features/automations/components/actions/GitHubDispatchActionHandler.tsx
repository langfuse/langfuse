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
    url: z
      .string()
      .url("Invalid URL")
      .refine(
        (url) => {
          const pattern =
            /^https:\/\/api\.github\.com\/repos\/[^\/]+\/[^\/]+\/dispatches$/;
          const enterprisePattern =
            /^https:\/\/[^\/]+\/api\/v3\/repos\/[^\/]+\/[^\/]+\/dispatches$/;
          return pattern.test(url) || enterprisePattern.test(url);
        },
        {
          message: "Must be a valid GitHub repository dispatch endpoint",
        },
      ),
    eventType: z.string().min(1, "Event type is required").max(100),
    githubToken: z.string().optional(), // Optional for updates, validated in backend
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
    } else {
      // Validate GitHub URL format
      const pattern =
        /^https:\/\/api\.github\.com\/repos\/[^\/]+\/[^\/]+\/dispatches$/;
      const enterprisePattern =
        /^https:\/\/[^\/]+\/api\/v3\/repos\/[^\/]+\/[^\/]+\/dispatches$/;

      if (
        !pattern.test(formData.githubDispatch.url) &&
        !enterprisePattern.test(formData.githubDispatch.url)
      ) {
        errors.push(
          "URL must be a valid GitHub repository dispatch endpoint (e.g., https://api.github.com/repos/owner/repo/dispatches)",
        );
      }
    }

    if (!formData.githubDispatch?.githubToken) {
      errors.push("GitHub token is required");
    }

    if (
      formData.githubDispatch?.eventType &&
      formData.githubDispatch.eventType.length > 100
    ) {
      errors.push("Event type must be 100 characters or less");
    }

    return {
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  buildActionConfig(formData: GitHubDispatchActionFormData): ActionCreate {
    return {
      type: "GITHUB_DISPATCH",
      url: formData.githubDispatch?.url || "",
      eventType: formData.githubDispatch?.eventType || undefined,
      // Send empty string if no token to preserve existing token on updates
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
